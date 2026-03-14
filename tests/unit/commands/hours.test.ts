import { describe, expect, it, vi } from "vitest";
import { buildHoursSummary } from "../../../src/ui/commands/hours";

vi.mock("../../../src/storage/rollup", () => ({
  getHourlyTotals: vi.fn(),
}));

import { getHourlyTotals } from "../../../src/storage/rollup";

describe("buildHoursSummary", () => {
  it("shows exactly 24 hour rows", () => {
    vi.mocked(getHourlyTotals).mockReturnValue(new Map());
    const result = buildHoursSummary();
    const hourLines = result.split("\n").filter((line) => line.includes(":xx"));
    expect(hourLines).toHaveLength(24);
  });

  it("shows header", () => {
    vi.mocked(getHourlyTotals).mockReturnValue(new Map());
    const result = buildHoursSummary();
    expect(result).toContain("oh-my-tokens — Hourly Usage");
  });

  it("shows empty bars when no data", () => {
    vi.mocked(getHourlyTotals).mockReturnValue(new Map());
    const result = buildHoursSummary();
    expect(result).toContain("░".repeat(12));
    expect(result).not.toContain("█");
  });

  it("shows filled bar for hour with data", () => {
    const data = new Map([[14, 5000]]);
    vi.mocked(getHourlyTotals).mockReturnValue(data);
    const result = buildHoursSummary();
    expect(result).toContain("14:xx");
    expect(result).toContain("█");
  });

  it("shows correct hour labels 00 through 23", () => {
    vi.mocked(getHourlyTotals).mockReturnValue(new Map());
    const result = buildHoursSummary();
    expect(result).toContain("00:xx");
    expect(result).toContain("23:xx");
  });
});
