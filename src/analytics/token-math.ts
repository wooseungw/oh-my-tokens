export interface TokenRow {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  total?: number;
}

export function computeTotalTokens(row: TokenRow): number {
  if (row.total !== undefined && row.total > 0) return row.total;
  return row.inp + row.out + row.think + row.cache_r + row.cache_w;
}
