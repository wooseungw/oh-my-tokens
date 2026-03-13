import { describe, expect, it } from "vitest";

import type { RollupRow } from "../../src/storage/rollup";

import {
  aggregateByAgent,
  aggregateByDate,
  aggregateByProvider,
} from "../../src/analytics/aggregator";

function createRow(overrides: Partial<RollupRow>): RollupRow {
  return {
    date: "2026-03-12",
    kind: "provider",
    name: "anthropic",
    inp: 100,
    out: 50,
    think: 20,
    chat: 10,
    code: 40,
    cache_r: 5,
    cache_w: 2,
    cost: 0.3,
    count: 1,
    ...overrides,
  };
}

describe("analytics aggregator", () => {
  it("aggregates rows by provider", () => {
    const aggregated = aggregateByProvider([
      createRow({
        name: "anthropic",
        inp: 100,
        out: 50,
        think: 20,
        cache_r: 5,
        cache_w: 2,
        cost: 0.3,
      }),
      createRow({
        name: "anthropic",
        inp: 40,
        out: 10,
        think: 5,
        cache_r: 3,
        cache_w: 1,
        cost: 0.1,
      }),
      createRow({ name: "openai", inp: 70, out: 20, think: 8, cache_r: 2, cache_w: 0, cost: 0.2 }),
    ]);

    expect(aggregated.get("anthropic")).toEqual({
      inp: 140,
      out: 60,
      think: 25,
      chat: 20,
      code: 80,
      cache_r: 8,
      cache_w: 3,
      cost: 0.4,
      count: 2,
      totalTokens: 236,
    });
    expect(aggregated.get("openai")?.totalTokens).toBe(100);
  });

  it("aggregates rows by agent", () => {
    const aggregated = aggregateByAgent([
      createRow({
        kind: "agent",
        name: "coder",
        inp: 200,
        out: 80,
        think: 40,
        cache_r: 10,
        cache_w: 4,
      }),
      createRow({
        kind: "agent",
        name: "coder",
        inp: 20,
        out: 10,
        think: 5,
        cache_r: 1,
        cache_w: 0,
      }),
      createRow({
        kind: "agent",
        name: "planner",
        inp: 30,
        out: 15,
        think: 4,
        cache_r: 0,
        cache_w: 0,
      }),
    ]);

    expect(aggregated.get("coder")).toMatchObject({
      inp: 220,
      out: 90,
      think: 45,
      count: 2,
      totalTokens: 370,
    });
    expect(aggregated.get("planner")).toMatchObject({ totalTokens: 49 });
  });

  it("aggregates rows by date", () => {
    const aggregated = aggregateByDate([
      createRow({ date: "2026-03-10", inp: 100, out: 20, think: 10, cache_r: 5, cache_w: 0 }),
      createRow({ date: "2026-03-10", inp: 50, out: 10, think: 5, cache_r: 2, cache_w: 1 }),
      createRow({ date: "2026-03-11", inp: 80, out: 30, think: 8, cache_r: 4, cache_w: 2 }),
    ]);

    expect(aggregated.get("2026-03-10")).toMatchObject({
      inp: 150,
      out: 30,
      think: 15,
      cache_r: 7,
      cache_w: 1,
      count: 2,
      totalTokens: 203,
    });
    expect(aggregated.get("2026-03-11")).toMatchObject({ totalTokens: 124 });
  });
});
