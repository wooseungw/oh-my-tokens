import { describe, expect, it, vi } from "vitest";

import { buildSessionsSummary } from "../../../src/ui/commands/sessions";

vi.mock("../../../src/storage/rollup", () => ({
  getTopSessions: vi.fn(),
}));

import { getTopSessions } from "../../../src/storage/rollup";

describe("buildSessionsSummary", () => {
  it("shows empty state when no sessions", () => {
    vi.mocked(getTopSessions).mockReturnValue([]);

    const result = buildSessionsSummary("normal");

    expect(result).toContain("No sessions recorded.");
  });

  it("shows session list with truncated IDs", () => {
    vi.mocked(getTopSessions).mockReturnValue([
      {
        sid: "abcdef1234567890",
        date: "2026-03-14",
        inp: 1000,
        out: 500,
        think: 0,
        chat: 0,
        code: 0,
        cache_r: 0,
        cache_w: 0,
        cost: 0,
        count: 3,
      },
    ]);

    const result = buildSessionsSummary("normal");

    expect(result).toContain("abcdef12");
    expect(result).toContain("2026-03-14");
    expect(result).not.toContain("abcdef1234567890");
  });

  it("shows header", () => {
    vi.mocked(getTopSessions).mockReturnValue([]);

    const result = buildSessionsSummary("normal");

    expect(result).toContain("oh-my-tokens — Top Sessions");
  });

  it("uses top 5 in compact mode", () => {
    vi.mocked(getTopSessions).mockReturnValue([]);

    buildSessionsSummary("compact");

    expect(getTopSessions).toHaveBeenCalledWith(7, 5);
  });
});
