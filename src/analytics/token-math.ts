export interface TokenRow {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
}

export function computeTotalTokens(row: TokenRow): number {
  return row.inp + row.out + row.think + row.cache_r + row.cache_w;
}
