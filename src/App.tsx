import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ScrollText, CheckCircle2, AlertCircle, Globe, Bell, SplitSquareHorizontal, User, TrendingUp, TrendingDown, ArrowRight, X, Lightbulb, Map, Package, Utensils, ShieldAlert } from 'lucide-react';
import { Network } from 'vis-network';
import { DataSet } from 'vis-data';

import type { Debt, EngineResult, LoopSuggestion, StallTrustScore, RiskNode } from './types';
import { runFullEngine } from './engine/fullEngine';
import { findLoopClosingOpportunities } from './engine/loopCloser';
import { STALL_CATALOG } from './data/stallCatalog';

import { calculateTrustScores } from './utils/trustScore';
import { formatFullMoney } from './utils/format';
import { calculateMarketHealth } from './utils/marketHealth';

function findAndResolveCycle(debts: { id: number, from: string, to: string, amount: number }[]) {
  const graph: Record<string, Record<string, number>> = {};
  debts.forEach(d => {
    if (!graph[d.from]) graph[d.from] = {};
    graph[d.from][d.to] = (graph[d.from][d.to] || 0) + d.amount;
  });

  const nodes = Object.keys(graph).concat(
    debts.map(d => d.to).filter(n => !graph[n])
  );
  
  let cyclePath: string[] = [];
  
  for (let startNode of nodes) {
    const visited = new Set<string>();
    const stack: string[] = [];
    
    function dfs(current: string): boolean {
      visited.add(current);
      stack.push(current);
      
      const neighbors = Object.keys(graph[current] || {});
      for (let next of neighbors) {
        if (graph[current][next] > 0) {
          const idx = stack.indexOf(next);
          if (idx !== -1) {
            cyclePath = stack.slice(idx);
            return true;
          }
          if (!visited.has(next)) {
            if (dfs(next)) return true;
          }
        }
      }
      stack.pop();
      return false;
    }
    
    if (dfs(startNode)) break;
  }

  if (cyclePath.length > 0) {
    const cycleEdges: {from: string, to: string}[] = [];
    let minAmount = Infinity;
    
    for (let i = 0; i < cyclePath.length; i++) {
      const from = cyclePath[i];
      const to = cyclePath[(i + 1) % cyclePath.length];
      cycleEdges.push({ from, to });
      minAmount = Math.min(minAmount, graph[from][to]);
    }

    let newDebts = [...debts];
    cycleEdges.forEach(c => {
      const dbItem = newDebts.find(item => item.from === c.from && item.to === c.to && item.amount > 0);
      if (dbItem) {
        dbItem.amount -= minAmount;
      }
    });
    
    newDebts = newDebts.filter(d => d.amount > 0);
    return {
      newDebts,
      resolvedAmount: minAmount,
      nodes: cyclePath
    };
  }
  return null;
}

interface GraphConfig {
  mode: 'vendor' | 'shopper' | 'admin';
  activeTab?: string;
  highlightNodes?: string[];
  highlightEdges?: {from: string, to: string}[];
  riskData?: RiskNode[];
  trustData?: StallTrustScore[];
}

function renderGraph(container: HTMLDivElement, debts: any[], currentUser: string, networkInstance: Network | null, onSelectNode?: (nodeId: string | null) => void, title?: string, config?: GraphConfig) {
  try {
    const nodes = new DataSet<any>();
  const edges = new DataSet<any>();
  
  const userNodes = new Set<string>();
  debts.forEach(d => { userNodes.add(d.from); userNodes.add(d.to); });
  if (!userNodes.has(currentUser)) userNodes.add(currentUser);

  Array.from(userNodes).forEach(u => {
    let bgColor = '#64748b';
    let size = 28;
    let borderWidth = 0;
    let borderColor = '';

    if (u === currentUser) bgColor = '#3b82f6';

    if (config?.mode === 'vendor' && config.activeTab === 'ai-suggest') {
       if (config.highlightNodes?.includes(u)) {
         bgColor = '#ec4899';
         size = 40;
         borderWidth = 4;
         borderColor = '#fbcfe8';
       } else if (config.highlightNodes && config.highlightNodes.length > 0) {
         bgColor = '#e2e8f0';
       }
    } 
    else if (config?.mode === 'admin') {
       const risk = config.riskData?.find(r => r.name === u);
       if (risk?.riskLevel === 'high') {
         bgColor = '#ef4444';
         size = 45;
         borderWidth = 4;
         borderColor = '#fee2e2';
       } else if (risk?.riskLevel === 'medium') {
         bgColor = '#f59e0b';
         size = 35;
       } else {
         bgColor = '#10b981';
       }
    }
    else if (config?.mode === 'shopper') {
       const trust = config.trustData?.find(t => t.name === u);
       if (trust) {
          size = Math.max(20, (trust.score / 1000) * 45);
          if (trust.score > 800) {
              bgColor = '#eab308';
              borderWidth = 3;
              borderColor = '#fef08a';
          }
       }
    }

    nodes.add({ 
      id: u, 
      label: title ? `${u}\n(Nút)` : u, 
      color: { background: bgColor, border: borderColor || bgColor }, 
      borderWidth,
      font: { color: 'white', size: 14, face: 'sans-serif' },
      size: size,
      shadow: true
    });
  });

  debts.forEach(d => {
    if (d.amount > 0) {
      let edgeColor = '#ef4444';
      let edgeWidth = 2;
      let edgeDashes = false;

      if (config?.mode === 'vendor' && config.activeTab === 'ai-suggest' && config.highlightEdges && config.highlightEdges.length > 0) {
        const isHighlighted = config.highlightEdges.some(e => e.from === d.from && e.to === d.to);
        if (isHighlighted) {
          edgeColor = '#ec4899';
          edgeWidth = 5;
        } else {
          edgeColor = '#f1f5f9';
          edgeDashes = true;
        }
      }

      edges.add({ 
        from: d.from, 
        to: d.to, 
        label: `${(d.amount/1000)}k`, 
        font: { align: 'middle', size: 12, color: edgeColor, background: 'white', strokeWidth: 3 }, 
        arrows: 'to', 
        color: { color: edgeColor, highlight: '#dc2626' },
        width: edgeWidth,
        dashes: edgeDashes
      });
    }
  });

  const data = { nodes, edges };
  const options = {
    physics: { enabled: true, solver: 'forceAtlas2Based', forceAtlas2Based: { gravitationalConstant: -50, springLength: 100 } },
    nodes: { shape: 'dot' },
    edges: { smooth: { enabled: true, type: 'dynamic', roundness: 0.5 }, selectionWidth: 3 },
    interaction: { hover: true, selectConnectedEdges: true }
  };
  
  if (networkInstance) {
    networkInstance.setData(data);
    return networkInstance;
  } else {
    const net = new Network(container, data, options);
    if (onSelectNode) {
      net.on('selectNode', (params) => {
        if (params.nodes.length > 0) onSelectNode(params.nodes[0]);
      });
      net.on('deselectNode', () => {
        onSelectNode(null);
      });
    }
    return net;
  }
  } catch(e: any) {
    container.innerHTML = `<div style="color:red; padding:20px; font-weight:bold;">GRAPH ERROR: ${e.message}</div>`;
    return null;
  }
}

type ResolutionModalData = 
  | { type: 'single', nodes: string[], amount: number, released: string[], updated: string[] }
  | { type: 'full', result: EngineResult, released: string[], updated: string[] };

function App() {
  const CURRENT_USER = 'Quán Cơm';
  const [demoRole, setDemoRole] = useState<'vendor' | 'shopper' | 'admin'>('vendor');
  const [activeTabVendor, setActiveTabVendor] = useState<'ghi-no' | 'so-no' | 'ai-suggest' | 'mua-chung' | 'marketing'>('ghi-no');
  const [activeTabShopper, setActiveTabShopper] = useState<'shop-map' | 'shop-tour'>('shop-map');
  const [debtSubTab, setDebtSubTab] = useState<'ai-no-toi' | 'toi-no-ai'>('ai-no-toi');
  
  const [deals, setDeals] = useState([
    { id: 1, product: 'Hành tây Đà Lạt', provider: 'Nông trại A', price: 10000, target: 2000, current: 1500, unit: 'kg' },
    { id: 2, product: 'Thịt bò Úc nguyên tảng', provider: 'Kho sỉ B', price: 180000, target: 100, current: 45, unit: 'kg' }
  ]);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [buyAmount, setBuyAmount] = useState(100);
  
  const [tempPartner, setTempPartner] = useState('Đại Lý Gas');
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  const phoneDB: Record<string, { phone: string, reason: string }> = {
    'Đại Lý Gas': { phone: '0912 345 678', reason: '1 Bình gas 12kg' },
    'Sạp Thịt': { phone: '0988 123 456', reason: 'Thịt heo, thịt bò' },
    'Sạp Rau': { phone: '0909 555 777', reason: 'Riềng, sả, cân hành lá' },
    'Quầy Bún': { phone: '0899 333 222', reason: '20kg bún' },
    'Sạp Cá': { phone: '0934 111 222', reason: 'Cá chép, cá rô' },
    'Quầy Đá': { phone: '0845 999 888', reason: '2 Bao đá viên' }
  };

  const handlePartnerChange = (val: string) => {
    setTempPartner(val);
    if (phoneDB[val]) {
      setTempPhone(phoneDB[val].phone);
      setTempReason(phoneDB[val].reason);
    } else {
      setTempPhone('');
      setTempReason('');
    }
  };

  const [tempAmount, setTempAmount] = useState('170000');
  const [tempType, setTempType] = useState('cho-no');
  const [tempPhone, setTempPhone] = useState('0912 345 678');
  const [tempReason, setTempReason] = useState('1 Bình gas 12kg');
  const [tempDate, setTempDate] = useState('2026-09-26T14:30');
  
  const [debts, setDebts] = useState<Debt[]>([
    { id: 1, from: 'Quán Cơm', to: 'Sạp Thịt', amount: 600000, reason: 'Lấy 3kg thịt bò, 4kg thịt heo', date: '2026-09-25T07:15' },
    { id: 2, from: 'Quán Cơm', to: 'Sạp Rau', amount: 420000, reason: 'Cân bắp cải, hành lá, cà chua', date: '2026-09-25T06:30' },
    { id: 3, from: 'Quán Cơm', to: 'Quầy Bún', amount: 300000, reason: '20kg bún tươi', date: '2026-09-24T05:45' },
    { id: 4, from: 'Quán Cơm', to: 'Sạp Cá', amount: 350000, reason: 'Lấy 2 con cá lóc, 3kg cá hú', date: '2026-09-25T08:00' },
    { id: 5, from: 'Quán Cơm', to: 'Quầy Đá', amount: 120000, reason: '4 bao đá viên xay', date: '2026-09-25T11:30' },
    { id: 6, from: 'Sạp Thịt', to: 'Quầy Đá', amount: 350000, reason: 'Lấy đá ướp thịt', date: '2026-09-24T12:00' },
    { id: 7, from: 'Sạp Cá', to: 'Quầy Đá', amount: 240000, reason: 'Lấy đá ướp cá', date: '2026-09-24T12:15' },
    { id: 8, from: 'Quầy Đá', to: 'Tiệm Sửa Máy', amount: 220000, reason: 'Sửa motor máy làm đá', date: '2026-09-23T15:00' },
    { id: 9, from: 'Tiệm Sửa Máy', to: 'C.H Vật Tư', amount: 180000, reason: 'Lấy linh kiện bạc đạn', date: '2026-09-23T16:30' },
    { id: 10, from: 'C.H Vật Tư', to: 'Tiệm In', amount: 130000, reason: 'In hóa đơn bán lẻ', date: '2026-09-23T09:15' },
    { id: 11, from: 'Tiệm In', to: 'Quán Cơm', amount: 160000, reason: 'Đặt suất cơm trưa VP', date: '2026-09-25T12:30' },
    { id: 12, from: 'Sạp Rau', to: 'Quầy Bún', amount: 200000, reason: 'Mua bún cho mùng 1', date: '2026-09-24T07:15' },
    { id: 13, from: 'Quầy Bún', to: 'Đại Lý Gas', amount: 170000, reason: 'Đổi bình gas đun nước lèo', date: '2026-09-24T08:45' },
    { id: 14, from: 'Công ty ABC', to: 'Quán Cơm', amount: 5000000, reason: 'Tiền cơm trưa VP tháng 9', date: '2026-09-20T10:00' }
  ]);

  const [pendingDebts, setPendingDebts] = useState<any[]>([]);
  const [originalDebts, setOriginalDebts] = useState<Debt[] | null>(null);
  const [notifications, setNotifications] = useState<{id: number, msg: string}[]>([]);
  
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredSuggestion, setHoveredSuggestion] = useState<LoopSuggestion | null>(null);
  const [factoringDebtId, setFactoringDebtId] = useState<number | null>(null);
  
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [resolutionModal, setResolutionModal] = useState<ResolutionModalData | null>(null);

  const networkRefCurrent = useRef<HTMLDivElement>(null);
  const networkRefOriginal = useRef<HTMLDivElement>(null);
  const [netCurrent, setNetCurrent] = useState<Network | null>(null);
  const [netOriginal, setNetOriginal] = useState<Network | null>(null);

  const health = useMemo(() => calculateMarketHealth(debts), [debts]);
  const trustScores = useMemo(() => calculateTrustScores(debts, []), [debts]);

  useEffect(() => {
    if (demoRole === 'vendor' || demoRole === 'admin' || demoRole === 'shopper') {
      let highlightNodes: string[] = [];
      let highlightEdges: {from: string, to: string}[] = [];

      if (demoRole === 'vendor' && activeTabVendor === 'ai-suggest' && hoveredSuggestion) {
         highlightNodes = hoveredSuggestion.chain;
         for(let i=0; i<hoveredSuggestion.chain.length; i++) {
           const from = hoveredSuggestion.chain[i];
           const to = hoveredSuggestion.chain[(i+1) % hoveredSuggestion.chain.length];
           highlightEdges.push({from, to});
         }
      }

      const config: GraphConfig = {
        mode: demoRole,
        activeTab: demoRole === 'vendor' ? activeTabVendor : (demoRole === 'shopper' ? activeTabShopper : undefined),
        highlightNodes,
        highlightEdges,
        riskData: health.riskNodes,
        trustData: trustScores
      };

      if (networkRefCurrent.current) {
        setNetCurrent(renderGraph(networkRefCurrent.current, debts, CURRENT_USER, netCurrent, setSelectedNode, undefined, config));
      }
      if (originalDebts && networkRefOriginal.current) {
        setNetOriginal(renderGraph(networkRefOriginal.current, originalDebts, CURRENT_USER, netOriginal, undefined, 'Original'));
      }
    }
  }, [debts, originalDebts, demoRole, activeTabVendor, activeTabShopper, hoveredSuggestion, health, trustScores]);

  const submitManualDebt = () => {
    if (!tempPartner || !tempAmount) return;
    const amountNum = Number(tempAmount);
    let from = CURRENT_USER;
    let to = tempPartner;
    if (tempType === 'cho-no') {
      from = tempPartner; to = CURRENT_USER;
    } else if (tempType === 'tra-tien') {
      from = CURRENT_USER; to = tempPartner;
    }
    
    setPendingDebts(prev => [{ id: Date.now(), from: from, to: to, amount: amountNum, reason: tempReason, date: tempDate, type: tempType }, ...prev]);
    addNotification(`Đã gửi thông báo đến ${tempPartner}. Đang chờ xác nhận...`);
    setActiveTabVendor('so-no');
  };

  const handleResolveStepByStep = () => {
    if (!originalDebts) {
      setOriginalDebts([...debts]);
    }
    
    const result = findAndResolveCycle(debts as any);
    if (result) {
      setDebts(result.newDebts as Debt[]);
      
      const released: string[] = [];
      const updated: string[] = [];
      
      result.nodes.forEach(node => {
        const owes = result.newDebts.filter(d => d.from === node).reduce((acc, d) => acc + d.amount, 0);
        const lent = result.newDebts.filter(d => d.to === node).reduce((acc, d) => acc + d.amount, 0);
        if (owes === 0 && lent === 0) { released.push(node); } else { updated.push(node); }
      });
      
      setResolutionModal({
        type: 'single',
        nodes: result.nodes,
        amount: result.resolvedAmount,
        released,
        updated
      });
      
      addNotification(`🎉 Đã xóa ${result.resolvedAmount.toLocaleString()}đ nợ vòng tròn!`);
    } else {
      addNotification(`Không phát hiện thêm vòng lặp nợ nào.`);
    }
  }

  const handleResolveFullEngine = () => {
    if (!originalDebts) {
      setOriginalDebts([...debts]);
    }
    
    const result = runFullEngine(debts);
    if (result.steps.length > 0) {
      setDebts(result.newDebts);
      
      const released: string[] = [];
      const updated: string[] = [];
      
      const allNodes = new Set<string>();
      debts.forEach(d => { allNodes.add(d.from); allNodes.add(d.to); });
      
      allNodes.forEach(node => {
        const oldOwes = debts.filter(d => d.from === node).reduce((acc, d) => acc + d.amount, 0);
        const oldLent = debts.filter(d => d.to === node).reduce((acc, d) => acc + d.amount, 0);
        const oldTotal = oldOwes + oldLent;
        
        const newOwes = result.newDebts.filter(d => d.from === node).reduce((acc, d) => acc + d.amount, 0);
        const newLent = result.newDebts.filter(d => d.to === node).reduce((acc, d) => acc + d.amount, 0);
        const newTotal = newOwes + newLent;
        
        if (oldTotal > 0 && newTotal === 0) {
          released.push(node);
        } else if (newTotal < oldTotal) {
          updated.push(node);
        }
      });
      
      setResolutionModal({
        type: 'full',
        result,
        released,
        updated
      });
      
      addNotification(`🎉 Đã xử lý ${result.steps.length} bước cấn trừ!`);
    } else {
      addNotification(`Không phát hiện cơ hội cấn trừ nào.`);
    }
  };

  const handleReset = () => {
    if (originalDebts) {
      setDebts(originalDebts);
      setOriginalDebts(null);
      setSelectedNode(null);
      setResolutionModal(null);
      addNotification("Đã khôi phục đồ thị về trạng thái Gốc.");
    }
  }

  const addNotification = (msg: string) => {
    const id = Date.now();
    setNotifications(prev => [{id, msg}, ...prev].slice(0, 3)); 
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 8000);
  }

  const handleAcceptSuggestion = (s: LoopSuggestion) => {
    const amountNum = s.suggestedAmount;
    const newPending = {
      id: Date.now(),
      from: s.targetUser,
      to: s.buyFromStall,
      amount: amountNum,
      reason: s.message,
      date: new Date().toISOString().slice(0, 16),
      type: 'ai-suggest'
    };
    setPendingDebts(prev => [newPending, ...prev]);
    addNotification("🎉 Đã tạo giao dịch khép vòng! Chờ xác nhận...");
    setActiveTabVendor('so-no');
  };

  const aiNoToi = debts.filter(d => d.to === CURRENT_USER);
  const toiNoAi = debts.filter(d => d.from === CURRENT_USER);

  const selectedInfo = useMemo(() => {
    if (!selectedNode) return null;
    const owes = debts.filter(d => d.from === selectedNode).reduce((acc, d) => acc + d.amount, 0);
    const lent = debts.filter(d => d.to === selectedNode).reduce((acc, d) => acc + d.amount, 0);
    return { name: selectedNode, owes, lent, balance: lent - owes };
  }, [selectedNode, debts]);

  const suggestions = useMemo(() => findLoopClosingOpportunities(debts, STALL_CATALOG), [debts]);

  const myReceivables = debts.filter(d => d.to === CURRENT_USER).reduce((acc, d) => acc + d.amount, 0);
  const myOwes = debts.filter(d => d.from === CURRENT_USER).reduce((acc, d) => acc + d.amount, 0);
  const netCredit = myReceivables - myOwes;

  const renderVendorTabs = () => (
    <>
      {activeTabVendor === 'ghi-no' && (
        <div className="flex flex-col items-center pt-8 pb-12 px-5 space-y-6 min-h-full">
          <div className="text-center space-y-2 w-full">
            <h2 className="text-2xl font-bold text-slate-800">Sổ Ghi Chép</h2>
            <p className="text-slate-500">Người dùng: <span className="font-bold">{CURRENT_USER}</span></p>
          </div>
          <div className="w-full bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">Khách hàng / Đối tác</label>
              <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-800 font-medium" value={tempPartner} onChange={(e) => handlePartnerChange(e.target.value)}>
                <option value="">-- Chọn khách quen --</option>
                <option value="Đại Lý Gas">Đại Lý Gas</option><option value="Sạp Thịt">Sạp Thịt</option><option value="Sạp Rau">Sạp Rau</option><option value="Quầy Bún">Quầy Bún</option><option value="Sạp Cá">Sạp Cá</option><option value="Quầy Đá">Quầy Đá</option>
              </select>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">Số ĐT Zalo (Nhận thông báo)</label>
              <input type="tel" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-800" value={tempPhone} onChange={(e) => setTempPhone(e.target.value)} />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">Loại giao dịch</label>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setTempType('cho-no')} className={`py-2 px-2 text-sm rounded-xl font-bold border ${tempType === 'cho-no' ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-slate-500'}`}>Họ nợ tôi (Bán)</button>
                <button onClick={() => setTempType('tra-tien')} className={`py-2 px-2 text-sm rounded-xl font-bold border ${tempType === 'tra-tien' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-white text-slate-500'}`}>Thanh toán nợ</button>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">Số tiền (VNĐ)</label>
              <input type="number" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800" value={tempAmount} onChange={(e) => setTempAmount(e.target.value)} />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-bold text-slate-700 mb-2">Lý do (Tùy chọn)</label>
              <input type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-800" value={tempReason} onChange={(e) => setTempReason(e.target.value)} />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Ngày ghi sổ</label>
              <input type="datetime-local" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-medium text-slate-800" value={tempDate} onChange={(e) => setTempDate(e.target.value)} />
            </div>
            <button onClick={submitManualDebt} className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-md">Lưu Giao Dịch</button>
          </div>
        </div>
      )}

      {activeTabVendor === 'so-no' && (
        <div className="p-4 space-y-4 pt-6">
            {pendingDebts.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-orange-200 overflow-hidden mb-4">
                <div className="bg-orange-50 p-3 border-b border-orange-100 flex justify-between items-center">
                  <span className="text-orange-800 font-bold text-sm flex items-center gap-2">⏳ Chờ xác nhận</span>
                  <span className="bg-orange-200 text-orange-800 text-xs font-black px-2 py-0.5 rounded-full">{pendingDebts.length}</span>
                </div>
                <div className="p-2 space-y-2">
                  {pendingDebts.map(p => (
                      <div key={p.id} className="p-3 bg-white border border-slate-100 rounded-xl shadow-sm flex justify-between items-center">
                        <div>
                            <p className="font-bold text-slate-800">{p.from === CURRENT_USER ? p.to : p.from}</p>
                            <p className="text-[11px] text-slate-500 font-medium">Đã gửi tin nhắn báo nợ</p>
                        </div>
                        <div className="text-right flex flex-col items-end">
                            <p className="font-black text-slate-700 mb-2">{p.amount.toLocaleString()}đ</p>
                            <button 
                              onClick={() => {
                                  setDebts(prev => {
                                    if (p.type === 'tra-tien') {
                                        let remainingToPay = p.amount;
                                        let found = false;
                                        let next = prev.map(d => {
                                            if (remainingToPay > 0 && ((d.from === p.from && d.to === p.to) || (d.from === p.to && d.to === p.from))) {
                                                found = true;
                                                if (d.amount > remainingToPay) {
                                                    const newAmt = d.amount - remainingToPay;
                                                    remainingToPay = 0;
                                                    return { ...d, amount: newAmt, reason: (p.reason ? p.reason + ' (Đã Trừ)' : 'Thanh toán nợ'), date: p.date };
                                                } else {
                                                    remainingToPay -= d.amount;
                                                    return { ...d, amount: 0 };
                                                }
                                            }
                                            return d;
                                        });
                                        
                                        next = next.filter(d => d.amount > 0);
                                        
                                        if (remainingToPay > 0 && !found) {
                                            return [{ id: p.id as number, from: p.to, to: p.from, amount: remainingToPay, reason: 'Ứng/Trả trước', date: p.date }, ...next];
                                        } else if (remainingToPay > 0 && found) {
                                            return [{ id: p.id as number, from: p.to, to: p.from, amount: remainingToPay, reason: 'Thanh toán dư', date: p.date }, ...next];
                                        }
                                        return next;
                                    } else {
                                        let updated = false;
                                        const next = prev.map(d => {
                                            if (d.from === p.from && d.to === p.to && !updated) {
                                                updated = true;
                                                return { ...d, amount: d.amount + p.amount, reason: p.reason, date: p.date };
                                            }
                                            return d;
                                        });
                                        if (updated) return next;
                                        return [{ id: p.id as number, from: p.from, to: p.to, amount: p.amount, reason: p.reason, date: p.date }, ...prev];
                                    }
                                });
                                  setPendingDebts(prev => prev.filter(d => d.id !== p.id));
                                  addNotification(`✅ C.Nhật Sổ: ${p.from === CURRENT_USER ? p.to : p.from} đã xác nhận nợ!`);
                              }}
                              className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-3 py-1.5 rounded-full font-bold shadow-md transition"
                            >
                              (Demo) Họ Bấm OK
                            </button>
                        </div>
                      </div>
                  ))}
                </div>
            </div>
            )}

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="flex border-b border-slate-100 cursor-pointer">
              <div 
                onClick={() => setDebtSubTab('ai-no-toi')}
                className={`flex-1 p-4 text-center text-sm font-bold border-b-2 transition-colors ${debtSubTab === 'ai-no-toi' ? 'text-blue-600 border-blue-600 bg-blue-50/50' : 'text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                AI NỢ TÔI ({aiNoToi.length})
              </div>
              <div 
                onClick={() => setDebtSubTab('toi-no-ai')}
                className={`flex-1 p-4 text-center text-sm font-bold border-b-2 transition-colors ${debtSubTab === 'toi-no-ai' ? 'text-blue-600 border-blue-600 bg-blue-50/50' : 'text-slate-400 border-transparent hover:bg-slate-50'}`}
              >
                TÔI NỢ AI ({toiNoAi.length})
              </div>
            </div>
            <div className="p-2 min-h-[400px]">
              {debtSubTab === 'ai-no-toi' && (
                <>
                  {aiNoToi.length === 0 && <div className="text-center text-slate-400 p-8 text-sm mt-10">Bạn đang không cho ai nợ</div>}
                  {aiNoToi.map((t, idx) => (
                    <div key={idx} className="flex flex-col p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition cursor-pointer" onClick={() => setExpandedRowId(expandedRowId === t.id ? null : t.id)}>
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-slate-800 text-[15px]">{t.from}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] text-green-700 font-bold bg-green-100 px-1.5 py-0.5 rounded uppercase">✓ Đã xác nhận</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-green-600 justify-end">+ {t.amount.toLocaleString()}đ</p>
                        </div>
                      </div>
                      
                      {expandedRowId === t.id && (
                          <div className="mt-3 pt-3 border-t border-slate-100/60 bg-blue-50/50 p-3 rounded-xl animate-fade-in">
                            <div className="flex flex-col gap-2">
                                <div className="flex">
                                  <span className="text-xs font-semibold text-slate-500 w-[65px]">Thời gian:</span>
                                  <span className="text-xs font-bold text-slate-700">{t.date ? t.date.replace('T', ' ') : '2026-09-25 10:00'}</span>
                                </div>
                                <div className="flex">
                                  <span className="text-xs font-semibold text-slate-500 w-[65px]">Nội dung:</span>
                                  <span className="text-xs font-medium text-slate-700 leading-snug">{t.reason || 'Số dư nợ cũ'}</span>
                                </div>
                            </div>
                            
                            {factoringDebtId === t.id ? (
                              <div className="mt-3 bg-white p-3 rounded-xl border border-blue-200 animate-fade-in shadow-inner">
                                <label className="block text-[11px] font-bold text-slate-600 mb-1">Thanh toán cho ai?</label>
                                <select 
                                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 mb-2 font-medium"
                                  id={`factor-select-${t.id}`}
                                >
                                  <option value="Bác Năm Nông Dân">Bác Năm (Cung cấp rau)</option>
                                  <option value="Lò Mổ Chú Tư">Lò Mổ Chú Tư</option>
                                  <option value="Đại lý Bao Bì">Đại lý Bao Bì</option>
                                </select>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const select = document.getElementById(`factor-select-${t.id}`) as HTMLSelectElement;
                                      const supplier = select.value;
                                      setDebts(prev => {
                                        const next = prev.filter(d => d.id !== t.id);
                                        next.push({
                                          id: Math.max(...prev.map(d=>d.id)) + 1,
                                          from: t.from,
                                          to: supplier,
                                          amount: t.amount,
                                          reason: `Gán nợ từ ${CURRENT_USER} (Gốc: ${t.reason})`,
                                          date: new Date().toISOString()
                                        });
                                        return next;
                                      });
                                      setFactoringDebtId(null);
                                      const notif = { id: Date.now(), msg: `🎉 Đã gán nợ của ${t.from} để thanh toán cho ${supplier}` };
                                      setNotifications(prev => [notif, ...prev]);
                                      setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== notif.id)), 4000);
                                    }}
                                    className="flex-1 bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded-lg hover:bg-blue-700"
                                  >
                                    Xác nhận
                                  </button>
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setFactoringDebtId(null); }}
                                    className="px-3 bg-slate-200 text-slate-600 text-[11px] font-bold py-1.5 rounded-lg hover:bg-slate-300"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFactoringDebtId(t.id);
                                }}
                                className="mt-3 w-full bg-blue-50 text-blue-600 text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-blue-100 border border-blue-200 transition"
                              >
                                <span className="text-[10px]">🔄</span> Thanh toán bằng khoản nợ này
                              </button>
                            )}
                          </div>
                      )}
                    </div>
                  ))}</>
              )}
              {debtSubTab === 'toi-no-ai' && (
                <>
                  {toiNoAi.length === 0 && <div className="text-center text-slate-400 p-8 text-sm mt-10">Bạn tuyệt vời, không nợ ai cả!</div>}
                  {toiNoAi.map((t, idx) => (
                    <div key={idx} className="flex flex-col p-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition cursor-pointer" onClick={() => setExpandedRowId(expandedRowId === t.id ? null : t.id)}>
                      <div className="flex justify-between items-center gap-3">
                        <div className="flex-1">
                          <p className="font-bold text-slate-800 text-[15px]">{t.to}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[9px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded uppercase">Sổ nợ</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-red-600 justify-end">- {t.amount.toLocaleString()}đ</p>
                        </div>
                      </div>
                      
                      {expandedRowId === t.id && (
                          <div className="mt-3 pt-3 border-t border-slate-100/60 bg-slate-50/80 p-3 rounded-xl animate-fade-in">
                            <div className="flex flex-col gap-2">
                                <div className="flex">
                                  <span className="text-xs font-semibold text-slate-500 w-[65px]">Thời gian:</span>
                                  <span className="text-xs font-bold text-slate-700">{t.date ? t.date.replace('T', ' ') : '2026-09-25 10:00'}</span>
                                </div>
                                <div className="flex">
                                  <span className="text-xs font-semibold text-slate-500 w-[65px]">Nội dung:</span>
                                  <span className="text-xs font-medium text-slate-700 leading-snug">{t.reason || 'Số dư nợ cũ'}</span>
                                </div>
                            </div>
                          </div>
                      )}
                    </div>
                  ))}</>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTabVendor === 'ai-suggest' && (
        <div className="p-4 space-y-4 h-full">
          <div className="text-center space-y-2 px-5 pt-6 pb-3">
            <h2 className="text-xl font-bold text-slate-800">🧠 Gợi Ý Khép Vòng</h2>
            <p className="text-sm text-slate-500">AI tìm cơ hội gạch nợ bằng mua hàng chéo</p>
          </div>
          {suggestions.length === 0 ? (
            <div className="text-center text-slate-400 p-8 text-sm mt-10">
              Không có gợi ý khép vòng nào lúc này.
            </div>
          ) : (
            suggestions.map((s, idx) => (
              <div 
                key={idx} 
                className="bg-gradient-to-r from-pink-50 to-purple-50 p-4 rounded-2xl border border-pink-200 mb-3 cursor-pointer hover:shadow-lg transition-all"
                onMouseEnter={() => setHoveredSuggestion(s)}
                onMouseLeave={() => setHoveredSuggestion(null)}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{STALL_CATALOG[s.buyFromStall]?.emoji || '🏪'}</span>
                  <span className="font-bold text-slate-800">{s.buyFromStall}</span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed mb-3">{s.message}</p>
                <div className="flex items-center gap-2 mb-3">
                  <span className="bg-pink-100 text-pink-700 px-2 py-1 rounded-lg text-xs font-bold">
                    {s.suggestedProduct} — {formatFullMoney(s.suggestedAmount)}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 mb-3">
                  Mạch nợ: {s.chain.join(' → ')} → {s.chain[0]}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAcceptSuggestion(s)} className="flex-1 py-2 bg-pink-500 text-white rounded-xl font-bold text-sm">
                    👍 Đồng ý mua
                  </button>
                  <button className="flex-1 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-sm">
                    Để sau
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
      
      {activeTabVendor === 'mua-chung' && (
        <div className="p-4 space-y-4 h-full">
          <div className="text-center space-y-2 px-5 pt-6 pb-3">
            <h2 className="text-xl font-bold text-slate-800">📦 Gom Đơn Sỉ - Giá Gốc</h2>
            <p className="text-sm text-slate-500">Dùng công nợ làm vốn, không cần tiền mặt!</p>
          </div>
          {deals.map((deal, idx) => (
            <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-3">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{deal.product}</h3>
                  <p className="text-xs text-slate-500">Nhà cung cấp: {deal.provider}</p>
                </div>
                <span className="font-black text-blue-600">{formatFullMoney(deal.price)}/{deal.unit}</span>
              </div>
              
              <div className="mb-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Đã gom: {deal.current}{deal.unit}</span>
                  <span>Mục tiêu: {deal.target}{deal.unit}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(100, (deal.current / deal.target) * 100)}%` }}></div>
                </div>
              </div>
              
              {selectedDeal?.id === deal.id ? (
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 mt-3 animate-fade-in">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng mua ({deal.unit})</label>
                  <input type="number" className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 mb-2" value={buyAmount} onChange={(e) => setBuyAmount(Number(e.target.value))} />
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-slate-500">Tổng tiền:</span>
                    <span className="font-bold text-red-600">{formatFullMoney(buyAmount * deal.price)}</span>
                  </div>
                  {buyAmount * deal.price <= netCredit ? (
                    <p className="text-xs text-green-600 font-medium mb-3">✅ Bạn có dư nợ {formatFullMoney(netCredit)} có thể thế chấp. Không cần tiền mặt!</p>
                  ) : (
                    <p className="text-xs text-red-600 font-medium mb-3">❌ Vượt quá công nợ thế chấp.</p>
                  )}
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        const cost = buyAmount * deal.price;
                        if (cost <= netCredit) {
                          setDeals(deals.map(d => d.id === deal.id ? { ...d, current: d.current + buyAmount } : d));
                          const newDebt: Debt = {
                            id: Math.max(...debts.map(d => d.id)) + 1,
                            from: CURRENT_USER,
                            to: 'Ngân Hàng (Cấp Vốn)',
                            amount: cost,
                            reason: 'Thế chấp công nợ để ngân hàng ứng vốn mua sỉ ' + deal.product,
                            date: new Date().toISOString()
                          };
                          setDebts([...debts, newDebt]);
                          addNotification('🎉 Đã chuyển giao công nợ cho Ngân hàng để giải ngân!');
                          setSelectedDeal(null);
                        }
                      }}
                      disabled={buyAmount * deal.price > netCredit}
                      className={`flex-1 py-2 text-white text-sm font-bold rounded-lg ${buyAmount * deal.price <= netCredit ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}
                    >
                      Xác nhận & Chuyển giao nợ cho Ngân hàng
                    </button>
                    <button onClick={() => setSelectedDeal(null)} className="px-3 py-2 bg-slate-200 text-slate-700 text-sm font-bold rounded-lg">Hủy</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { setSelectedDeal(deal); setBuyAmount(100); }} className="w-full py-2 bg-blue-50 text-blue-600 font-bold rounded-xl text-sm border border-blue-100 hover:bg-blue-100 transition">
                  Tham gia
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {activeTabVendor === 'marketing' && (
        <div className="p-4 space-y-4 h-full">
          <div className="text-center space-y-2 px-5 pt-6 pb-3">
            <h2 className="text-xl font-bold text-slate-800">🎁 Marketing Liên Kết</h2>
            <p className="text-sm text-slate-500">Tạo voucher liên kết với sạp khác để hút khách!</p>
          </div>
          
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-3">
            <h3 className="font-bold text-slate-700 mb-2">Tạo Voucher Tặng Khách</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">Khi khách mua hàng tại {CURRENT_USER}</label>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-medium">Mua từ 200.000đ trở lên</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">Được tặng Voucher giảm giá tại</label>
                <select id="voucher-partner-select" className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-sm font-medium outline-none">
                  <option>Sạp Rau (Cô Liên)</option>
                  <option>Quầy Gia Vị (Chị Mai)</option>
                  <option>Sạp Trái Cây (Bác Hoa)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-bold block mb-1">Mức giảm giá cho khách (VND)</label>
                <input type="number" defaultValue="20000" className="w-full bg-white border border-slate-200 rounded-lg p-2 text-sm font-medium outline-none focus:border-pink-500" />
              </div>
              <p className="text-[10px] text-amber-700 font-medium italic bg-amber-50 p-2 rounded border border-amber-200 leading-relaxed">
                ⚠️ <b>Lưu ý:</b> Việc phát hành Voucher chéo tương đương với việc mở hạn mức nợ. Yêu cầu này sẽ được gửi đến đối tác. Khi đối tác <b>Xác nhận đồng ý</b>, Voucher mới chính thức hiển thị trên máy của Khách hàng.
              </p>
              <button 
                onClick={() => {
                  const select = document.getElementById('voucher-partner-select') as HTMLSelectElement;
                  addNotification(`⏳ Đã gửi yêu cầu liên kết Marketing đến ${select.value}. Đang chờ xác nhận...`);
                  setTimeout(() => {
                    addNotification(`🎉 Cập nhật: ${select.value} đã CHẤP NHẬN hợp tác! Voucher của bạn đã hiển thị cho Khách.`);
                  }, 4000);
                }}
                className="w-full bg-pink-500 text-white font-bold py-2 rounded-xl hover:bg-pink-600 transition shadow-md flex justify-center items-center gap-2"
              >
                Gửi Yêu Cầu Hợp Tác 🤝
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderShopperTabs = () => (
    <>
      {activeTabShopper === 'shop-map' && (
        <div className="p-4 space-y-4 h-full">
          <div className="text-center space-y-2 px-5 pt-6 pb-3">
            <h2 className="text-xl font-bold text-slate-800">🏠 Chợ Ba Vì</h2>
            <p className="text-sm text-slate-500">Bản đồ uy tín các sạp hàng</p>
          </div>
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 rounded-2xl text-white shadow-lg mb-4 flex items-center justify-between cursor-pointer hover:shadow-xl transition" onClick={() => {
             addNotification('📸 Đã quét QR Homestay! Giảm 5% toàn chợ. Hoa hồng đã tự động ghi có cho Homestay.');
          }}>
             <div>
                <p className="font-bold">Nhập mã / Quét QR Homestay</p>
                <p className="text-[10px] text-blue-100 mt-1">Lấy mã giảm giá và tích điểm</p>
             </div>
             <span className="text-2xl">📸</span>
          </div>

          <div className="bg-pink-50 p-4 rounded-2xl border border-pink-200 shadow-sm mb-4">
             <h3 className="font-bold text-pink-800 flex items-center gap-2 mb-3">
               🎟️ Ví Voucher của bạn
             </h3>
             <div className="bg-white p-3 rounded-xl shadow-sm border border-pink-100 flex justify-between items-center cursor-pointer hover:shadow-md transition" onClick={() => {
                 addNotification('🎉 Đã áp dụng Voucher giảm 20.000đ tại Sạp Rau thành công!');
             }}>
                <div>
                   <p className="font-bold text-slate-700 text-sm">Giảm 20.000đ tại Sạp Rau</p>
                   <p className="text-[10px] text-slate-500">Được tặng từ: Quán Cơm</p>
                </div>
                <button className="bg-pink-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-pink-600">
                   Dùng ngay
                </button>
             </div>
          </div>

          {trustScores.map((ts, idx) => (
            <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{STALL_CATALOG[ts.name]?.emoji || '🏪'}</span>
                  <div>
                    <p className="font-bold text-slate-800">{ts.name}</p>
                    <p className="text-[10px] text-slate-400">{STALL_CATALOG[ts.name]?.location || 'Chợ Ba Vì'}</p>
                  </div>
                </div>
                {ts.badge && (
                  <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-lg text-xs font-bold">
                    {ts.badge.emoji} {ts.badge.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 mb-2">
                {[1,2,3,4,5].map(i => (
                  <span key={i} className={i <= ts.stars ? 'text-amber-400' : 'text-slate-200'}>⭐</span>
                ))}
                <span className="text-xs text-slate-400 ml-2">{ts.score} điểm</span>
              </div>
              <div className="flex gap-2 text-[10px]">
                <span className="bg-green-50 text-green-600 px-2 py-0.5 rounded">✅ Xác nhận {ts.confirmRate}%</span>
                <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded">🔄 Cấn trừ {ts.nettingCount} lần</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTabShopper === 'shop-tour' && (
        <div className="p-4 space-y-4 h-full">
          <div className="text-center space-y-2 px-5 pt-6 pb-3">
            <h2 className="text-xl font-bold text-slate-800">🗺️ Food Tour Chợ</h2>
            <p className="text-sm text-slate-500">Gợi ý tour ẩm thực dựa trên uy tín</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="space-y-3 text-sm text-slate-600">
              <p className="font-bold flex items-center gap-2"><Utensils className="w-4 h-4 text-orange-500"/> 1. 🥩 Sạp Thịt Chú Hải (🥇 Điểm uy tín cao)</p>
              <p className="font-bold flex items-center gap-2"><Utensils className="w-4 h-4 text-green-500"/> 2. 🥬 Sạp Rau Cô Liên (🥈 Nguyên liệu tươi)</p>
              <p className="font-bold flex items-center gap-2"><Utensils className="w-4 h-4 text-blue-500"/> 3. 🍜 Quầy Bún Bà Tám</p>
              <p className="font-bold flex items-center gap-2"><Utensils className="w-4 h-4 text-cyan-500"/> 4. 🧊 Quầy Đá Mát Lạnh</p>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const renderAdminDashboard = () => (
    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
      <h2 className="text-2xl font-bold text-slate-800 mb-6">📊 Sức Khỏe Tài Chính Chợ Ba Vì</h2>
      
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-semibold">Tổng nợ lưu thông</p>
          <p className="text-2xl font-black text-slate-800">{formatFullMoney(health.totalDebt)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-semibold">Số khoản nợ</p>
          <p className="text-2xl font-black text-slate-800">{health.totalTransactions}</p>
        </div>
        <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-200 shadow-sm">
          <p className="text-sm text-emerald-600 font-semibold">Khả năng cấn trừ</p>
          <p className="text-2xl font-black text-emerald-700">{health.nettablePercent}%</p>
          <p className="text-xs text-emerald-500">{formatFullMoney(health.nettableAmount)}</p>
        </div>
      </div>
      
      {health.riskNodes.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="bg-red-50 p-4 border-b border-red-100">
            <h3 className="font-bold text-red-800 flex items-center gap-2"><ShieldAlert className="w-5 h-5"/> Cảnh báo rủi ro</h3>
          </div>
          <div className="p-4 space-y-3">
            {health.riskNodes.map(rn => (
              <div key={rn.name} className={`p-4 rounded-xl border ${rn.riskLevel === 'high' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-slate-800">
                    {rn.riskLevel === 'high' ? '🔴' : '🟡'} {rn.name}
                  </span>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${rn.riskLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {rn.riskLevel === 'high' ? 'Rủi ro CAO' : 'Theo dõi'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                  <span className="text-slate-500">Nợ phải trả: <b className="text-red-600">{formatFullMoney(rn.totalOwes)}</b></span>
                  <span className="text-slate-500">Bị nợ: <b className="text-green-600">{formatFullMoney(rn.totalLent)}</b></span>
                </div>
                <p className="text-xs text-slate-500 mb-2">💡 {rn.suggestion}</p>
                {rn.riskLevel === 'high' && (
                  <button 
                    onClick={() => {
                      addNotification(`🏦 Đã kích hoạt gói giải cứu thanh khoản khẩn cấp cho ${rn.name}!`);
                    }}
                    className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-lg transition"
                  >
                    Kích hoạt Cứu trợ (Bailout)
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-6 rounded-2xl border border-teal-200">
        <h3 className="font-bold text-teal-800 mb-3">🏡 Kết nối Du lịch</h3>
        <p className="text-sm text-teal-700 mb-4">Liên kết homestay, khách sạn với chợ để tạo vòng giao dịch khép kín và sản phẩm du lịch "ăn chợ" độc đáo.</p>
        <div className="bg-white/60 p-4 rounded-xl border border-teal-100">
          <p className="text-xs text-teal-600 font-semibold mb-2">💡 Ví dụ mô hình:</p>
          <div className="flex items-center gap-2 text-sm text-slate-700 flex-wrap">
            <span className="bg-teal-100 px-2 py-1 rounded-lg">🏡 Homestay</span>
            <span>→</span>
            <span className="bg-amber-100 px-2 py-1 rounded-lg">🥩 Sạp Thịt 500k</span>
            <span>→</span>
            <span className="bg-teal-100 px-2 py-1 rounded-lg">🏡 Hoa hồng 50k</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">→ Cấn trừ tự động: Còn 450.000đ</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen font-sans">
      <div className="bg-slate-900 text-white p-3 flex justify-center items-center gap-4 z-50 relative shrink-0">
        <span className="font-bold">🎭 Kịch Bản Demo:</span>
        <button onClick={() => setDemoRole('vendor')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${demoRole === 'vendor' ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : 'bg-slate-700 hover:bg-slate-600'}`}>👨‍🍳 Tiểu Thương</button>
        <button onClick={() => setDemoRole('shopper')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${demoRole === 'shopper' ? 'bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.5)]' : 'bg-slate-700 hover:bg-slate-600'}`}>🛒 Khách Đi Chợ</button>
        <button onClick={() => setDemoRole('admin')} className={`px-4 py-1.5 rounded-full text-sm font-bold transition ${demoRole === 'admin' ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]' : 'bg-slate-700 hover:bg-slate-600'}`}>📊 BQL Chợ</button>
      </div>

      <div className="flex flex-1 bg-slate-100 gap-6 overflow-hidden">
        <div className="w-1/3 min-w-[420px] flex items-center justify-center p-8 bg-slate-200 shadow-[inset_-10px_0_20px_rgba(0,0,0,0.05)] z-10 border-r border-slate-300 relative">
          <div className="w-[380px] h-[780px] bg-white rounded-[45px] shadow-2xl overflow-hidden border-[14px] border-slate-800 flex flex-col relative ring-4 ring-slate-300">
            
            <div className="absolute top-16 left-0 right-0 px-4 z-50 pointer-events-none space-y-3">
              {notifications.map((notif) => (
                <div key={notif.id} className="bg-white/95 backdrop-blur-md p-4 rounded-3xl shadow-[0_10px_40px_rgba(33,150,243,0.4)] border border-blue-200 flex items-start space-x-3 pointer-events-auto transform transition-all animate-bounce">
                  <Bell className="text-blue-600 shrink-0 w-6 h-6 animate-pulse mt-0.5" />
                  <p className="text-slate-800 text-sm font-semibold leading-snug">{notif.msg}</p>
                </div>
              ))}
            </div>

            <div className="bg-blue-600 text-white pt-12 pb-4 px-5 shadow-sm flex shrink-0 items-center justify-between">
              <h1 className="text-lg font-bold">
                {demoRole === 'admin' ? 'BQL Chợ (Zalo)' : (demoRole === 'vendor' ? 'Sổ Nợ Zalo (MVP)' : 'Zalo Chợ Ba Vì')}
              </h1>
              <div className="bg-white/20 p-1.5 rounded-full"><AlertCircle className="w-5 h-5"/></div>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 relative">
              {demoRole === 'vendor' && renderVendorTabs()}
              {demoRole === 'shopper' && renderShopperTabs()}
              {demoRole === 'admin' && renderAdminDashboard()}
            </div>

              {demoRole === 'vendor' && (
                <div className="bg-white border-t border-slate-100 flex pb-8 pt-3 shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20 shrink-0 relative">
                  <button 
                    onClick={() => setActiveTabVendor('ghi-no')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabVendor === 'ghi-no' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <User className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Ghi Nợ</span>
                  </button>
                  <button 
                    onClick={() => setActiveTabVendor('so-no')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabVendor === 'so-no' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <ScrollText className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Sổ Nợ</span>
                  </button>
                  <button 
                    onClick={() => setActiveTabVendor('ai-suggest')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabVendor === 'ai-suggest' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <Lightbulb className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Gợi Ý AI</span>
                  </button>
                  <button 
                    onClick={() => setActiveTabVendor('mua-chung')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabVendor === 'mua-chung' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <Package className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Mua Chung</span>
                  </button>
                  <button 
                    onClick={() => setActiveTabVendor('marketing')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabVendor === 'marketing' ? 'text-pink-600' : 'text-slate-400 hover:text-pink-400'}`}
                  >
                    <span className="text-xl">🎁</span>
                    <span className="text-[10px] font-bold mt-1">Marketing</span>
                  </button>
                </div>
              )}

              {demoRole === 'shopper' && (
                <div className="bg-white border-t border-slate-100 flex pb-8 pt-3 shadow-[0_-10px_20px_rgba(0,0,0,0.03)] z-20 shrink-0 relative">
                  <button 
                    onClick={() => setActiveTabShopper('shop-map')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabShopper === 'shop-map' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <Map className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Bản Đồ</span>
                  </button>
                  <button 
                    onClick={() => setActiveTabShopper('shop-tour')}
                    className={`flex-1 flex flex-col items-center space-y-1 ${activeTabShopper === 'shop-tour' ? 'text-blue-600' : 'text-slate-400 hover:text-blue-400'}`}
                  >
                    <Utensils className="w-6 h-6" />
                    <span className="text-[10px] font-bold mt-1">Food Tour</span>
                  </button>
                </div>
              )}
            </div>
          </div>

        <div className={`${demoRole === 'admin' ? 'w-2/3' : 'w-2/3'} flex flex-col bg-slate-50 h-full relative`}>
          {demoRole === 'shopper' ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10 bg-slate-100">
               <Map className="w-24 h-24 text-blue-300 mb-6" />
               <h2 className="text-3xl font-black text-slate-800 mb-4">Mở Rộng Hệ Sinh Thái NetFlow</h2>
               <p className="text-lg text-slate-500 max-w-lg mb-8">Giao diện Zalo Mini App dành cho Người tiêu dùng. Khách hàng quét mã QR tại chợ để mở ứng dụng, tìm kiếm sạp uy tín và tham gia hệ sinh thái.</p>
               <button 
                onClick={() => setShowScriptModal(true)}
                className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-400 text-yellow-900 font-bold py-4 px-8 rounded-2xl shadow-lg transition-all"
              >
                <span className="text-xl">📝 Xem Kịch Bản Demo</span>
              </button>
            </div>
          ) : (
            <>
              <div className="p-6 bg-slate-900 border-b border-slate-800 text-white flex justify-between items-center shadow-lg z-20 shrink-0">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-3"><Globe className="w-8 h-8 text-blue-400"/>Đồ Thị Nợ Tổng Chợ Bavi</h2>
                  <p className="text-slate-400 text-sm mt-1">Click vào một Nút bất kỳ để xem Dư nợ chủ thể</p>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setShowScriptModal(true)}
                    className="flex items-center space-x-2 bg-yellow-500 hover:bg-yellow-400 text-yellow-900 font-bold py-3 px-5 rounded-2xl shadow-lg transition-all"
                  >
                    <span>📝 Kịch Bản Demo</span>
                  </button>
                  {originalDebts && (
                    <button 
                      onClick={handleReset}
                      className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-5 rounded-2xl shadow-lg transition-all"
                    >
                      <span>Tái Tạo Gốc</span>
                    </button>
                  )}
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={handleResolveFullEngine}
                      className="flex items-center justify-center space-x-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-bold py-3 px-6 rounded-2xl shadow-lg transform hover:-translate-y-0.5 transition-all focus:ring-4 focus:ring-emerald-500/50"
                    >
                      <SplitSquareHorizontal className="w-6 h-6" />
                      <span className="text-lg">Thuật Toán Cấn Trừ Chéo</span>
                    </button>
                    <button
                      onClick={handleResolveStepByStep}
                      className="text-xs font-bold text-slate-400 hover:text-slate-200 underline decoration-slate-600"
                    >
                      Cấn Trừ Từng Bước
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex p-6 gap-6 relative min-h-0 bg-slate-100 z-0">
                <div className={`flex flex-col bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden transition-all duration-500 ${originalDebts ? 'w-1/2' : 'w-full'}`}>
                   <div className="bg-slate-50 p-4 border-b border-slate-200 text-center font-bold text-slate-700 flex justify-between items-center px-6">
                      <span>{originalDebts ? '🟢 LƯỚI SAU CẤN TRỪ (Sạch)' : '🟢 MẠNG LƯỚI KHỞI ĐIỂM (Click nút xem)'}</span>
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs">{debts.length} Khoản nợ</span>
                   </div>
                   <div ref={networkRefCurrent} className="flex-1 cursor-grab active:cursor-grabbing outline-none" style={{ minHeight: '400px' }} />
                </div>

                {originalDebts && (
                  <div className="w-1/2 flex flex-col bg-slate-100 rounded-[32px] shadow-inner border border-slate-200 overflow-hidden opacity-95">
                     <div className="bg-slate-200/50 p-4 border-b border-slate-200 text-center font-bold text-slate-500 flex justify-between items-center px-6">
                        <span>🔴 TRƯỚC CẤN TRỪ (Chằng Chịt)</span>
                        <span className="bg-slate-200 text-slate-600 px-3 py-1 rounded-full text-xs">{originalDebts.length} Khoản nợ</span>
                     </div>
                     <div ref={networkRefOriginal} className="flex-1 cursor-not-allowed outline-none sepia-[.3]" style={{ minHeight: '400px' }} />
                  </div>
                )}
              </div>

              {selectedNode && selectedInfo && (
                 <div className="absolute bottom-8 right-8 z-40 bg-white/95 backdrop-blur-xl w-[360px] rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 animate-slide-up overflow-hidden">
                   
                   <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 flex justify-between items-center text-white">
                      <div className="flex items-center gap-3">
                         <div className="bg-white/20 p-2 rounded-full"><User className="w-6 h-6"/></div>
                         <h3 className="font-bold text-lg">{selectedInfo.name}</h3>
                      </div>
                      <button onClick={() => setSelectedNode(null)} className="hover:bg-white/20 p-1.5 rounded-full transition">
                        <X className="w-5 h-5" />
                      </button>
                   </div>

                   <div className="p-6 space-y-5">
                      <div className="flex justify-between items-end border-b border-slate-100 pb-4">
                        <span className="text-slate-500 font-semibold text-sm">TRẠNG THÁI TỔNG BÙ TRỪ</span>
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase ${selectedInfo.balance > 0 ? 'bg-green-100 text-green-700' : selectedInfo.balance < 0 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.3)]'}`}>
                          {selectedInfo.balance > 0 ? 'Dương Nợ' : selectedInfo.balance < 0 ? 'Âm Nợ' : 'Sạch nợ / 0đ'}
                        </span>
                      </div>

                      <div className={`p-3 rounded-xl border flex justify-between items-center ${selectedInfo.owes > 0 ? 'bg-red-50/50 border-red-100 text-red-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <TrendingDown className="w-4 h-4" /> nợ người ta
                        </div>
                        <span className={`font-black ${selectedInfo.owes > 0 ? 'text-red-700' : 'text-slate-400'}`}>{(selectedInfo.owes || 0).toLocaleString()}đ</span>
                      </div>

                      <div className={`p-3 rounded-xl border flex justify-between items-center ${selectedInfo.lent > 0 ? 'bg-green-50/50 border-green-100 text-green-600' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                          <TrendingUp className="w-4 h-4" /> người ta nợ
                        </div>
                        <span className={`font-black ${selectedInfo.lent > 0 ? 'text-green-700' : 'text-slate-400'}`}>{(selectedInfo.lent || 0).toLocaleString()}đ</span>
                      </div>

                      <div className="bg-slate-900 p-4 rounded-2xl flex justify-between items-center text-white shadow-inner">
                        <span className="font-bold text-sm text-slate-300">DƯ NỢ CUỐI CÙNG:</span>
                        <span className={`text-xl font-black ${selectedInfo.balance > 0 ? 'text-green-400' : selectedInfo.balance < 0 ? 'text-red-400' : 'text-emerald-400 animate-pulse'}`}>
                          {selectedInfo.balance > 0 ? '+' : ''}{(selectedInfo.balance || 0).toLocaleString()}đ
                        </span>
                      </div>
                   </div>
                 </div>
              )}
            </>
          )}
        </div>
      </div>

      {showScriptModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-12">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-fade-in border-4 border-yellow-400/20">
             <div className="bg-yellow-400 p-6 flex justify-between items-center">
                <h3 className="text-xl font-black text-yellow-900 flex items-center gap-2">📝 KỊCH BẢN DEMO BGK</h3>
                <button onClick={() => setShowScriptModal(false)} className="text-yellow-900 bg-yellow-500/50 hover:bg-yellow-500 p-2 rounded-full transition">
                   <X className="w-5 h-5"/>
                </button>
             </div>
             <div className="p-8 pb-10 bg-yellow-50/50 overflow-y-auto max-h-[70vh]">
                <ol className="list-decimal pl-5 space-y-4 text-slate-800 font-medium leading-relaxed text-[16px]">
                  {demoRole === 'vendor' && (
                    <>
                      <li><strong>Lớp 1 (Ghi nợ + Xác nhận):</strong> Click tab <strong>Ghi Nợ</strong>. Chọn <strong>Bán Nợ</strong>, Nhập số tiền <strong>170000</strong>, bấm <strong>Lưu Giao Dịch</strong>. Sang tab <strong>Sổ Nợ</strong>, bấm <strong>(Demo) Họ Bấm OK</strong>.</li>
                      <li><strong>Lớp 2 (AI Khép vòng):</strong> Chuyển sang tab <strong>Gợi Ý AI</strong> ở điện thoại. Xem các gợi ý mua chéo để tạo vòng lặp nợ, bấm <strong>Đồng ý mua</strong>.</li>
                      <li><strong>Lớp 3 (Mua chung sỉ):</strong> Chuyển sang tab <strong>Mua Chung</strong>, dùng công nợ thế chấp để gom đơn sỉ.</li>
                    </>
                  )}
                  {demoRole === 'shopper' && (
                    <>
                      <li><strong>Bước 1 (Quét QR):</strong> Khách hàng đến chợ, quét mã QR để mở Zalo Mini App.</li>
                      <li><strong>Bước 2 (Xem Uy tín Sạp):</strong> Vào tab <strong>Bản đồ</strong> để xem điểm tín nhiệm của từng sạp hàng.</li>
                      <li><strong>Bước 3 (Đi tour ẩm thực):</strong> Vào tab <strong>Food Tour</strong> xem gợi ý hành trình khám phá chợ.</li>
                    </>
                  )}
                  {demoRole === 'admin' && (
                    <>
                      <li><strong>Bước 1 (Giám sát rủi ro vĩ mô):</strong> Xem bảng Sức khỏe tài chính bên trái, nhận diện sạp đang gặp rủi ro cao.</li>
                      <li><strong>Bước 2 (Chạy thuật toán cấn trừ):</strong> Bấm <strong>Thuật Toán Cấn Trừ Chéo</strong> trên bản đồ để tối ưu hóa dòng tiền.</li>
                      <li><strong>Bước 3 (Phân tích dòng tiền):</strong> Đánh giá mức triệt tiêu nợ toàn chợ sau khi chạy engine.</li>
                    </>
                  )}
                </ol>
                <button onClick={() => setShowScriptModal(false)} className="w-full mt-8 py-4 bg-slate-900 text-white text-lg font-bold rounded-xl shadow-lg hover:bg-slate-800 transition">
                  Đã hiểu, Bắt đầu thử!
                </button>
             </div>
          </div>
        </div>
      )}

      {resolutionModal && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-12">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden animate-fade-in border-4 border-white max-h-[90vh] flex flex-col">
             <div className="bg-emerald-500 p-8 text-center relative overflow-hidden shrink-0">
                <div className="absolute top-0 right-0 p-4">
                  <button onClick={() => setResolutionModal(null)} className="text-white/80 hover:text-white bg-black/10 hover:bg-black/20 p-2 rounded-full transition">
                     <X className="w-6 h-6" />
                  </button>
                </div>
                <CheckCircle2 className="w-20 h-20 text-white mx-auto mb-4 animate-bounce" />
                <h2 className="text-3xl font-black text-white drop-shadow-md">PHÁT HIỆN LƯỚI NỢ KÍN!</h2>
                <p className="text-emerald-50 font-medium text-lg mt-2">Thuật toán vừa duyệt và triệt tiêu lưới nợ hiệu quả</p>
             </div>

             <div className="p-8 space-y-8 bg-slate-50 overflow-y-auto">
                <div className="text-center">
                  <p className="text-slate-500 font-bold mb-1">MỨC TRIỆT TIÊU ĐỒNG LOẠT</p>
                  <p className="text-5xl font-black text-red-600">
                    -{resolutionModal.type === 'single' ? (resolutionModal.amount || 0).toLocaleString() : resolutionModal.result.steps.reduce((sum, s) => sum + s.resolvedAmount, 0).toLocaleString()}đ
                  </p>
                </div>

                <div>
                   <p className="text-slate-600 font-bold mb-3 text-sm">🔄 CHI TIẾT CÁC BƯỚC CẤN TRỪ:</p>
                   <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                      {resolutionModal.type === 'single' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {resolutionModal.nodes.map((node, i) => (
                            <React.Fragment key={i}>
                              <span className="px-3 py-1.5 bg-slate-100 text-slate-800 rounded-lg text-sm font-bold border border-slate-200">{node}</span>
                              {i < resolutionModal.nodes.length - 1 && <ArrowRight className="w-4 h-4 text-emerald-500 shrink-0" />}
                            </React.Fragment>
                          ))}
                        </div>
                      ) : (
                        resolutionModal.result.steps.map((step, idx) => (
                          <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
                            <p className="font-bold text-slate-700 mb-1">Bước {idx + 1}: {step.type === 'cycle' ? 'Vòng lặp' : 'Chuỗi tuyến tính'} - {step.description}</p>
                            <div className="flex flex-wrap items-center gap-1 mt-2 text-xs">
                              {step.involvedNodes.map((node, i) => (
                                <React.Fragment key={i}>
                                  <span className="px-2 py-1 bg-white border border-slate-200 rounded font-semibold text-slate-600">{node}</span>
                                  {i < step.involvedNodes.length - 1 && <ArrowRight className="w-3 h-3 text-emerald-500" />}
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                   </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                   <div className="bg-white p-5 rounded-2xl border-2 border-emerald-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg">TUYỆT ĐỐI</div>
                      <h4 className="font-bold text-emerald-700 flex items-center gap-2 mb-3">
                         <CheckCircle2 className="w-5 h-5"/> NÚT GIẢI PHÓNG
                      </h4>
                      <p className="text-xs text-slate-500 mb-3">(Sạch nợ / 0đ dư nợ tổng)</p>
                      <div className="flex gap-2 flex-wrap">
                        {resolutionModal.released.length > 0 ? resolutionModal.released.map(n => (
                           <span key={n} className="bg-emerald-50 text-emerald-700 font-black px-3 py-1 rounded-full text-sm border border-emerald-200">{n} 🎉</span>
                        )) : <span className="text-sm text-slate-400 italic">Không có ai</span>}
                      </div>
                   </div>

                   <div className="bg-white p-5 rounded-2xl border-2 border-blue-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 right-0 bg-blue-500 text-white text-[10px] font-black px-2 py-1 rounded-bl-lg">MỘT PHẦN</div>
                      <h4 className="font-bold text-blue-700 flex items-center gap-2 mb-3">
                         <TrendingDown className="w-5 h-5"/> NÚT CẬP NHẬT
                      </h4>
                      <p className="text-xs text-slate-500 mb-3">(Được giảm bớt nợ / Vẫn còn nợ gốc)</p>
                      <div className="flex gap-2 flex-wrap">
                        {resolutionModal.updated.length > 0 ? resolutionModal.updated.map(n => (
                           <span key={n} className="bg-blue-50 text-blue-700 font-semibold px-3 py-1 rounded-full text-sm border border-blue-200">{n}</span>
                        )) : <span className="text-sm text-slate-400 italic">Không có</span>}
                      </div>
                   </div>
                </div>

                <button 
                  onClick={() => setResolutionModal(null)}
                  className="w-full py-4 bg-slate-900 text-white font-bold text-lg rounded-2xl shadow-xl hover:bg-slate-800 transition transform hover:-translate-y-1"
                >
                  Đóng Báo Cáo & Xem Đồ Thị &gt;&gt;
                </button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

