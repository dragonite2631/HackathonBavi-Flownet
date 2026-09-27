import type { Debt, EngineStep } from '../types';

export function netSettle(debts: Debt[]): { newDebts: Debt[]; steps: EngineStep[] } {
  const pairMap = new Map<string, number>();
  
  debts.forEach(d => {
    const sorted = [d.from, d.to].sort();
    const key = `${sorted[0]}|${sorted[1]}`;
    const sign = d.from === sorted[0] ? 1 : -1;
    pairMap.set(key, (pairMap.get(key) || 0) + sign * d.amount);
  });
  
  const newDebts: Debt[] = [];
  const steps: EngineStep[] = [];
  let nextId = Math.max(0, ...debts.map(d => d.id)) + 1;
  
  pairMap.forEach((netAmount, key) => {
    if (netAmount === 0) {
      const [u, v] = key.split('|');
      const originalU = debts.filter(d => (d.from === u && d.to === v) || (d.from === v && d.to === u));
      if (originalU.length > 1) {
        steps.push({
          type: 'net-settle',
          description: `Cấn trừ trực tiếp giữa ${u} và ${v}`,
          resolvedAmount: originalU.reduce((s, d) => s + d.amount, 0) / 2,
          involvedNodes: [u, v]
        });
      }
      return;
    }
    
    const [nodeA, nodeB] = key.split('|');
    const from = netAmount > 0 ? nodeA : nodeB;
    const to = netAmount > 0 ? nodeB : nodeA;
    const amount = Math.abs(netAmount);
    
    const originalDebts = debts.filter(d => (d.from === nodeA && d.to === nodeB) || (d.from === nodeB && d.to === nodeA));
    const totalOriginalAmount = originalDebts.reduce((s, d) => s + d.amount, 0);
    const resolvedAmount = (totalOriginalAmount - amount) / 2;

    if (resolvedAmount > 0) {
      steps.push({
        type: 'net-settle',
        description: `Cấn trừ trực tiếp giữa ${nodeA} và ${nodeB}`,
        resolvedAmount,
        involvedNodes: [nodeA, nodeB]
      });
    }

    newDebts.push({
      id: nextId++,
      from,
      to,
      amount
    });
  });
  
  return { newDebts, steps };
}
