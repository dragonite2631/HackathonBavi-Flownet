import type { Debt, EngineStep } from '../types';

export function simplifyChains(debts: Debt[]): { newDebts: Debt[]; steps: EngineStep[] } {
  let currentDebts = [...debts];
  const steps: EngineStep[] = [];
  
  let changed = true;
  while (changed) {
    changed = false;
    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    
    currentDebts.forEach(d => {
      inDegree.set(d.to, (inDegree.get(d.to) || 0) + 1);
      outDegree.set(d.from, (outDegree.get(d.from) || 0) + 1);
    });
    
    for (const d1 of currentDebts) {
      if (changed) break;
      const b = d1.to;
      // b is pure intermediary if inDegree == 1 and outDegree == 1
      if (inDegree.get(b) === 1 && outDegree.get(b) === 1) {
        const d2 = currentDebts.find(d => d.from === b);
        if (d2 && d1.from !== d2.to) { // avoid creating A->B->A (handled by cycle)
          const a = d1.from;
          const c = d2.to;
          const minAmount = Math.min(d1.amount, d2.amount);
          
          let nextId = Math.max(0, ...currentDebts.map(d => d.id)) + 1;
          
          const newDebts: Debt[] = [];
          let existingAC = false;
          
          currentDebts.forEach(d => {
            if (d.id === d1.id) {
              if (d.amount > minAmount) newDebts.push({ ...d, amount: d.amount - minAmount });
            } else if (d.id === d2.id) {
              if (d.amount > minAmount) newDebts.push({ ...d, amount: d.amount - minAmount });
            } else if (d.from === a && d.to === c) {
              existingAC = true;
              newDebts.push({ ...d, amount: d.amount + minAmount });
            } else {
              newDebts.push({ ...d });
            }
          });
          
          if (!existingAC) {
            newDebts.push({
              id: nextId++,
              from: a,
              to: c,
              amount: minAmount,
              reason: `Chuyển giao nợ từ ${b}`
            });
          }
          
          steps.push({
            type: 'chain-simplify',
            description: `Rút gọn chuỗi: ${a} trả thẳng ${c} thay vì qua ${b}`,
            resolvedAmount: minAmount, // effectively resolved minAmount of B's debt
            involvedNodes: [a, b, c]
          });
          
          currentDebts = newDebts;
          changed = true;
        }
      }
    }
  }
  
  return { newDebts: currentDebts, steps };
}
