import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/analytics/budget", () => ({
  checkBudget: vi.fn(() => []),
  getBudgetConfig: vi.fn(() => ({})),
}));

vi.mock("../../../src/ui/formatter", () => ({
  formatTokens: vi.fn((n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }),
}));

vi.mock("../../../src/ui/render", () => ({
  buildBar: vi.fn((pct: number) => {
    const normalized = Math.max(0, Math.min(pct, 100));
    const filled = Math.round((normalized / 100) * 16);
    return `${"█".repeat(filled)}${"░".repeat(16 - filled)}`;
  }),
  buildSectionRule: vi.fn((width?: number) => "═".repeat(width ?? 42)),
  maxContentWidth: vi.fn((title: string, ...lines: string[]) => {
    const allLines = [title, ...lines];
    return Math.max(42, ...allLines.map((l) => l.length));
  }),
}));

import { checkBudget } from "../../../src/analytics/budget";
import { buildBudgetSummary } from "../../../src/ui/commands/budget-cmd";

describe("buildBudgetSummary", () => {
  it("shows no budgets configured message when statuses empty", () => {
    vi.mocked(checkBudget).mockReturnValue([]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("No budgets configured");
    expect(result).toContain("OMT_DAILY_BUDGET_TOKENS");
  });

  it("shows checkmark when ratio < 0.8", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("✓");
    expect(result).not.toContain("~");
    expect(result).not.toContain("!");
  });

  it("shows tilde when ratio >= 0.8 and not exceeded", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.85,
        exceeded: false,
        used: 8_500,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("~");
    expect(result).not.toContain("✓");
    expect(result).not.toContain("!");
  });

  it("shows exclamation when exceeded", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 1.2,
        exceeded: true,
        used: 12_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("!");
    expect(result).not.toContain("✓");
    expect(result).not.toContain("~");
  });

  it("includes bar in normal mode", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("█");
    expect(result).toContain("░");
  });

  it("excludes bar in text mode", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("text");

    expect(result).not.toContain("█");
    expect(result).not.toContain("░");
  });

  it("displays percentage correctly", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.333,
        exceeded: false,
        used: 3_330,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("33.3%");
  });

  it("displays used and limit tokens", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000_000,
        limit: 10_000_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("5.0M");
    expect(result).toContain("10.0M");
  });

  it("handles multiple budget periods", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
      {
        period: "weekly",
        ratio: 0.3,
        exceeded: false,
        used: 30_000,
        limit: 100_000,
      },
      {
        period: "monthly",
        ratio: 0.2,
        exceeded: false,
        used: 200_000,
        limit: 1_000_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("daily");
    expect(result).toContain("weekly");
    expect(result).toContain("monthly");
  });

  it("pads period name to 7 characters", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("daily  ");
  });

  it("includes title in output", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("oh-my-tokens — Budget Status");
  });

  it("includes section rules", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary("normal");

    expect(result).toContain("═");
  });

  it("defaults to normal mode when not specified", () => {
    vi.mocked(checkBudget).mockReturnValue([
      {
        period: "daily",
        ratio: 0.5,
        exceeded: false,
        used: 5_000,
        limit: 10_000,
      },
    ]);

    const result = buildBudgetSummary();

    expect(result).toContain("█");
    expect(result).toContain("░");
  });
});
