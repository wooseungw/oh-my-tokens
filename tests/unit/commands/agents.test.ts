import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/config/reader", () => ({
  getUnitSetting: vi.fn(() => "tokens"),
}));

import { getUnitSetting } from "../../../src/config/reader";
import type { RollupRow } from "../../../src/storage/rollup";
import { buildAgentSummary } from "../../../src/ui/commands/agents";

describe("buildAgentSummary", () => {
  it("should be a function", () => {
    expect(typeof buildAgentSummary).toBe("function");
  });

  it("should return a string", () => {
    const rows: RollupRow[] = [];
    const result = buildAgentSummary(rows, "normal");
    expect(typeof result).toBe("string");
  });

  it("shows cost when unit=cost", () => {
    vi.mocked(getUnitSetting).mockReturnValue("cost");

    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "agent",
        name: "Coder",
        inp: 1_000,
        out: 500,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 2.5,
        count: 1,
      },
    ];

    const result = buildAgentSummary(rows, "text");
    expect(result).toContain("$2.50");
    expect(result).not.toContain(" tok");
  });

  it("shows only top 3 agents in compact mode", () => {
    const rows: RollupRow[] = [
      {
        date: "2026-03-14",
        kind: "agent",
        name: "A",
        inp: 4,
        out: 0,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "agent",
        name: "B",
        inp: 3,
        out: 0,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "agent",
        name: "C",
        inp: 2,
        out: 0,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
      {
        date: "2026-03-14",
        kind: "agent",
        name: "D",
        inp: 1,
        out: 0,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 1,
      },
    ];

    const result = buildAgentSummary(rows, "compact");

    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("C");
    expect(result).not.toContain("D");
  });
});
