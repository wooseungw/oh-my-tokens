import type { RollupRow } from "../storage/rollup";

export interface AggregatedUsage {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
  count: number;
  totalTokens: number;
}

function emptyUsage(): AggregatedUsage {
  return {
    inp: 0,
    out: 0,
    think: 0,
    chat: 0,
    code: 0,
    cache_r: 0,
    cache_w: 0,
    cost: 0,
    count: 0,
    totalTokens: 0,
  };
}

function totalTokens(usage: {
  total: number;
  inp: number;
  out: number;
  think: number;
  cache_r: number;
  cache_w: number;
}): number {
  if (usage.total > 0) return usage.total;
  return usage.inp + usage.out + usage.think + usage.cache_r + usage.cache_w;
}

function aggregateByKey(
  rows: RollupRow[],
  getKey: (row: RollupRow) => string,
): Map<string, AggregatedUsage> {
  const aggregated = new Map<string, AggregatedUsage>();

  for (const row of rows) {
    const key = getKey(row);
    const current = aggregated.get(key) ?? emptyUsage();
    const next = {
      inp: current.inp + row.inp,
      out: current.out + row.out,
      think: current.think + row.think,
      chat: current.chat + row.chat,
      code: current.code + row.code,
      cache_r: current.cache_r + row.cache_r,
      cache_w: current.cache_w + row.cache_w,
      cost: current.cost + row.cost,
      total: (current.totalTokens > 0 ? current.totalTokens : 0) + row.total,
      count: current.count + row.count,
    };

    aggregated.set(key, {
      ...next,
      totalTokens: totalTokens(next),
    });
  }

  return aggregated;
}

export function aggregateByProvider(rows: RollupRow[]): Map<string, AggregatedUsage> {
  return aggregateByKey(rows, (row) => row.name);
}

export function aggregateByAgent(rows: RollupRow[]): Map<string, AggregatedUsage> {
  return aggregateByKey(rows, (row) => row.name);
}

export function aggregateByDate(rows: RollupRow[]): Map<string, AggregatedUsage> {
  return aggregateByKey(rows, (row) => row.date);
}
