import type { Debt, EngineStep } from '../types';

function findOneCycle(debts: Debt[]): { cyclePath: string[]; minAmount: number } | null {
  const graph = new Map<string, Array<{ to: string; amount: number }>>();
  debts.forEach(d => {
    if (!graph.has(d.from)) graph.set(d.from, []);
    graph.get(d.from)!.push({ to: d.to, amount: d.amount });
  });

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];
  
  let cyclePath: string[] | null = null;

  function dfs(node: string) {
    if (cyclePath) return;
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        dfs(neighbor.to);
      } else if (recStack.has(neighbor.to)) {
        // Cycle found
        const startIndex = path.indexOf(neighbor.to);
        cyclePath = path.slice(startIndex);
        return;
      }
      if (cyclePath) return;
    }
    
    recStack.delete(node);
    path.pop();
  }

  const nodes = Array.from(graph.keys());
  for (const node of nodes) {
    if (!visited.has(node)) {
      dfs(node);
      if (cyclePath) break;
    }
  }

  if (!cyclePath) return null;

  let minAmount = Infinity;
  for (let i = 0; i < cyclePath.length; i++) {
    const from = cyclePath[i];
    const to = cyclePath[(i + 1) % cyclePath.length];
    const edge = graph.get(from)!.find(e => e.to === to)!;
    if (edge.amount < minAmount) minAmount = edge.amount;
  }

  return { cyclePath, minAmount };
}

function resolveCycle(debts: Debt[], cyclePath: string[], minAmount: number): { newDebts: Debt[]; step: EngineStep } {
  const newDebts: Debt[] = [];
  let nextId = Math.max(0, ...debts.map(d => d.id)) + 1;

  const cycleEdges = cyclePath.map((node, i) => {
    return { from: node, to: cyclePath[(i + 1) % cyclePath.length] };
  });

  const isCycleEdge = (u: string, v: string) => cycleEdges.some(e => e.from === u && e.to === v);

  debts.forEach(d => {
    if (isCycleEdge(d.from, d.to)) {
      const remaining = d.amount - minAmount;
      if (remaining > 0) {
        newDebts.push({ ...d, amount: remaining });
      }
    } else {
      newDebts.push({ ...d });
    }
  });

  const step: EngineStep = {
    type: 'cycle',
    description: `Khép vòng cấn trừ ${cyclePath.join(' → ')} → ${cyclePath[0]}`,
    resolvedAmount: minAmount * cyclePath.length, // total amount resolved in cycle
    involvedNodes: [...cyclePath],
    cycleEdges
  };

  return { newDebts, step };
}

export function resolveAllCycles(debts: Debt[]): { newDebts: Debt[]; steps: EngineStep[] } {
  let currentDebts = [...debts];
  const steps: EngineStep[] = [];
  
  while (true) {
    const cycle = findOneCycle(currentDebts);
    if (!cycle) break;
    
    const result = resolveCycle(currentDebts, cycle.cyclePath, cycle.minAmount);
    currentDebts = result.newDebts;
    steps.push(result.step);
  }
  
  return { newDebts: currentDebts, steps };
}
