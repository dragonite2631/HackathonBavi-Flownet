export interface Debt {
  id: number;
  from: string;
  to: string;
  amount: number;
  reason?: string;
  date?: string;
}

export interface PendingDebt extends Debt {
  type: 'cho-no' | 'tra-tien';
}

export interface CycleResult {
  newDebts: Debt[];
  resolvedAmount: number;
  nodes: string[];
  cycleEdges: { from: string; to: string }[];
}

export interface EngineResult {
  newDebts: Debt[];
  steps: EngineStep[];
  totalResolved: number;
  totalCyclesFound: number;
  releasedNodes: string[];
  updatedNodes: string[];
  chainsSimplified: number;
}

export interface EngineStep {
  type: 'net-settle' | 'cycle' | 'chain-simplify';
  description: string;
  resolvedAmount: number;
  involvedNodes: string[];
  cycleEdges?: { from: string; to: string }[];
}

export interface LoopSuggestion {
  id: string;
  targetUser: string;  // Who should buy (C in A->B->C)
  buyFromStall: string; // Where to buy (A)
  suggestedProduct: string;
  suggestedAmount: number;
  debtToClear: number;
  chain: string[];  // The open chain that would be closed
  message: string;  // Friendly Vietnamese message
}

export interface StallInfo {
  name: string;
  products: { name: string; price: number }[];
  emoji: string;
  location?: string;
}

export interface TrustBadge {
  level: 'bronze' | 'silver' | 'gold' | 'diamond';
  label: string;
  emoji: string;
  description: string;
}

export interface StallTrustScore {
  name: string;
  score: number;  // 0-100
  stars: number;  // 1-5
  badge: TrustBadge | null;
  confirmRate: number;
  nettingCount: number;
  payOnTimeRate: number;
  helpOthersCount: number;
}

export interface MarketHealth {
  totalDebt: number;
  totalTransactions: number;
  nettableAmount: number;
  nettablePercent: number;
  riskNodes: RiskNode[];
}

export interface RiskNode {
  name: string;
  totalOwes: number;
  totalLent: number;
  connectedNodes: number;
  riskLevel: 'low' | 'medium' | 'high';
  suggestion: string;
}
