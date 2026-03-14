import { describe, expect, it, vi } from "vitest";

import { buildModelsSummary } from "../../../src/ui/commands/models";

vi.mock("../../../src/storage/rollup", () => ({
  getModelRollups: vi.fn(),
}));

import { getModelRollups } from "../../../src/storage/rollup";

const makeRow = (name: string, inp: number, out: number) => ({
  date: "2026-03-14",
  kind: "model",
  name,
  inp,
  out,
  think: 0,
  chat: 0,
  code: 0,
  cache_r: 0,
  cache_w: 0,
  cost: 0,
  count: 1,
});

describe("buildModelsSummary", () => {
  it("shows empty state when no models", () => {
    vi.mocked(getModelRollups).mockReturnValue([]);

    const result = buildModelsSummary();

    expect(result).toContain("No model data recorded.");
  });

  it("shows model names", () => {
    vi.mocked(getModelRollups).mockReturnValue([
      makeRow("claude-sonnet-4", 5000, 1000),
      makeRow("gpt-4o", 2000, 500),
    ]);

    const result = buildModelsSummary();

    expect(result).toContain("claude-sonnet-4");
    expect(result).toContain("gpt-4o");
  });

  it("shows header", () => {
    vi.mocked(getModelRollups).mockReturnValue([]);

    const result = buildModelsSummary();

    expect(result).toContain("oh-my-tokens — Model Usage");
  });

  it("handles (unknown) model name", () => {
    vi.mocked(getModelRollups).mockReturnValue([makeRow("(unknown)", 1000, 200)]);

    const result = buildModelsSummary();

    expect(result).toContain("(unknown)");
  });
});
