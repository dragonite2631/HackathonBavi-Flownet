import type { Debt, LoopSuggestion, StallInfo } from '../types';

export function findLoopClosingOpportunities(debts: Debt[], stallCatalog: Record<string, StallInfo>): LoopSuggestion[] {
  const suggestions: LoopSuggestion[] = [];
  
  const graph = new Map<string, Array<{ to: string; amount: number }>>();
  debts.forEach(d => {
    if (!graph.has(d.from)) graph.set(d.from, []);
    graph.get(d.from)!.push({ to: d.to, amount: d.amount });
  });

  const paths: Array<{ path: string[], amount: number }> = [];

  function dfs(node: string, currentPath: string[], currentAmount: number) {
    const neighbors = graph.get(node) || [];
    let isEnd = true;
    for (const neighbor of neighbors) {
      if (!currentPath.includes(neighbor.to)) {
        isEnd = false;
        dfs(neighbor.to, [...currentPath, neighbor.to], Math.min(currentAmount, neighbor.amount));
      }
    }
    if (isEnd && currentPath.length >= 3) { // min length A->B->C
      paths.push({ path: currentPath, amount: currentAmount });
    }
  }

  const nodes = Array.from(graph.keys());
  for (const node of nodes) {
    dfs(node, [node], Infinity);
  }

  // Deduplicate and process paths
  paths.forEach(p => {
    const head = p.path[0];
    const tail = p.path[p.path.length - 1];

    if (stallCatalog[head]) {
      const stall = stallCatalog[head];
      const affordableProduct = stall.products.find(prod => prod.price <= p.amount * 1.5 && prod.price >= p.amount * 0.5);
      
      if (affordableProduct) {
        suggestions.push({
          id: `sug-${head}-${tail}-${Date.now()}`,
          targetUser: tail,
          buyFromStall: head,
          suggestedProduct: affordableProduct.name,
          suggestedAmount: affordableProduct.price,
          debtToClear: Math.min(p.amount, affordableProduct.price),
          chain: p.path,
          message: `Cô ${tail} ơi, hôm nay sang ${head} lấy ${affordableProduct.name} (${affordableProduct.price.toLocaleString('vi-VN')}đ), tiện gạch luôn ${Math.min(p.amount, affordableProduct.price).toLocaleString('vi-VN')}đ nợ!`
        });
      }
    }
  });

  suggestions.sort((a, b) => b.debtToClear - a.debtToClear);
  
  // Return unique target-buyFrom combinations to avoid spam
  const uniqueSuggestions: LoopSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of suggestions) {
    const key = `${s.targetUser}-${s.buyFromStall}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSuggestions.push(s);
    }
  }

  return uniqueSuggestions;
}
