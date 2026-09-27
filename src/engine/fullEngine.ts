import type { Debt, EngineResult } from '../types';
import { netSettle } from './netSettle';
import { resolveAllCycles } from './cycleResolver';
import { simplifyChains } from './chainSimplifier';

export function runFullEngine(debts: Debt[]): EngineResult {
  const step1 = netSettle(debts);
  const step2 = resolveAllCycles(step1.newDebts);
  const step3 = simplifyChains(step2.newDebts);
  
  const allSteps = [...step1.steps, ...step2.steps, ...step3.steps];
  const totalResolved = allSteps.reduce((sum, s) => sum + s.resolvedAmount, 0);
  
  const allNodes = new Set<string>();
  debts.forEach(d => { allNodes.add(d.from); allNodes.add(d.to); });
  
  const releasedNodes: string[] = [];
  const updatedNodes: string[] = [];
  
  allNodes.forEach(node => {
    const owes = step3.newDebts.filter(d => d.from === node).reduce((s, d) => s + d.amount, 0);
    const lent = step3.newDebts.filter(d => d.to === node).reduce((s, d) => s + d.amount, 0);
    if (owes === 0 && lent === 0) releasedNodes.push(node);
    else updatedNodes.push(node);
  });
  
  return {
    newDebts: step3.newDebts,
    steps: allSteps,
    totalResolved,
    totalCyclesFound: step2.steps.length,
    releasedNodes,
    updatedNodes,
    chainsSimplified: step3.steps.length
  };
}
