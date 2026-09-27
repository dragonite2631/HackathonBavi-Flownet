import type { Debt, MarketHealth, RiskNode } from '../types';
import { runFullEngine } from '../engine/fullEngine';

export function calculateMarketHealth(debts: Debt[]): MarketHealth {
  const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
  
  // Run engine to see how much can be netted
  const engineResult = runFullEngine(debts);
  const remainingDebt = engineResult.newDebts.reduce((sum, d) => sum + d.amount, 0);
  const nettableAmount = totalDebt - remainingDebt;
  const nettablePercent = totalDebt > 0 ? Math.round((nettableAmount / totalDebt) * 100) : 0;
  
  // Calculate risk for each node
  const nodeMap = new Map<string, { owes: number; lent: number; connections: Set<string> }>();
  debts.forEach(d => {
    if (!nodeMap.has(d.from)) nodeMap.set(d.from, { owes: 0, lent: 0, connections: new Set() });
    if (!nodeMap.has(d.to)) nodeMap.set(d.to, { owes: 0, lent: 0, connections: new Set() });
    nodeMap.get(d.from)!.owes += d.amount;
    nodeMap.get(d.from)!.connections.add(d.to);
    nodeMap.get(d.to)!.lent += d.amount;
    nodeMap.get(d.to)!.connections.add(d.from);
  });
  
  const riskNodes: RiskNode[] = [];
  nodeMap.forEach((info, name) => {
    const netDebt = info.owes - info.lent;
    const connections = info.connections.size;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    let suggestion = '';
    
    if (netDebt > 500000 && connections >= 3) {
      riskLevel = 'high';
      suggestion = `Ưu tiên cấn trừ nợ liên quan ${name} trước. Rủi ro ảnh hưởng ${connections} sạp.`;
    } else if (netDebt > 200000 || connections >= 4) {
      riskLevel = 'medium';
      suggestion = `Theo dõi ${name}. Nên thanh toán sớm 1-2 khoản lớn nhất.`;
    } else {
      suggestion = 'Ổn định.';
    }
    
    if (riskLevel !== 'low') {
      riskNodes.push({ name, totalOwes: info.owes, totalLent: info.lent, connectedNodes: connections, riskLevel, suggestion });
    }
  });
  
  riskNodes.sort((a, b) => {
    if (a.riskLevel === 'high' && b.riskLevel !== 'high') return -1;
    if (b.riskLevel === 'high' && a.riskLevel !== 'high') return 1;
    return 0;
  });
  
  return { totalDebt, totalTransactions: debts.length, nettableAmount, nettablePercent, riskNodes };
}
