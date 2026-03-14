export function formatTokens(n: number): string {
  if (n < 1_000) {
    return String(n);
  }

  if (n < 1_000_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }

  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}
