import type { Debt, StallTrustScore, TrustBadge } from '../types';

const BADGES: TrustBadge[] = [
  { level: 'bronze', label: 'Sạp Uy Tín', emoji: '🥉', description: '3 tháng liên tục sòng phẳng' },
  { level: 'silver', label: 'Sạp Tương Trợ', emoji: '🥈', description: 'Tham gia 5+ lần khép vòng' },
  { level: 'gold', label: 'Sạp Vàng Cộng Đồng', emoji: '🥇', description: 'Top 10% điểm tín nhiệm' },
  { level: 'diamond', label: 'Sạp Kim Cương', emoji: '💎', description: '12 tháng + tương trợ 20+ lần' },
];

export function calculateTrustScores(debts: Debt[], nettingHistory: { node: string; count: number }[]): StallTrustScore[] {
  const nodes = new Set<string>();
  debts.forEach(d => { nodes.add(d.from); nodes.add(d.to); });
  
  const scores: StallTrustScore[] = [];
  
  nodes.forEach(node => {
    // Simulated deterministic values for demo purposes
    const hash = node.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const confirmRate = 80 + (hash % 21); // 80-100%
    const payOnTimeRate = 75 + (hash % 26); // 75-100%
    
    const nettingCount = nettingHistory.find(n => n.node === node)?.count || (hash % 10);
    const helpOthersCount = hash % 5;
    
    // Weight calculation
    const baseScore = (confirmRate * 0.4) + (payOnTimeRate * 0.4);
    const bonusScore = Math.min(20, (nettingCount * 1.5) + (helpOthersCount * 2.5));
    
    const score = Math.min(100, Math.round(baseScore + bonusScore));
    
    scores.push({
      name: node,
      score,
      stars: getStarsForScore(score),
      badge: getBadgeForScore(score),
      confirmRate,
      nettingCount,
      payOnTimeRate,
      helpOthersCount
    });
  });
  
  return scores.sort((a, b) => b.score - a.score);
}

export function getBadgeForScore(score: number): TrustBadge | null {
  if (score >= 95) return BADGES[3]; // diamond
  if (score >= 85) return BADGES[2]; // gold  
  if (score >= 75) return BADGES[1]; // silver
  if (score >= 60) return BADGES[0]; // bronze
  return null;
}

export function getStarsForScore(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}
