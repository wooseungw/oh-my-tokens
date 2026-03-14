import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/storage/sessions", () => ({
  getRootInitiator: vi.fn(() => null),
  getSessionAncestry: vi.fn(() => []),
}));

import { getRootInitiator, getSessionAncestry } from "../../../src/storage/sessions";
import { resolveAttribution } from "../../../src/tracking/attribution";

beforeEach(() => {
  vi.mocked(getRootInitiator).mockReset();
  vi.mocked(getRootInitiator).mockReturnValue(null);
  vi.mocked(getSessionAncestry).mockReset();
  vi.mocked(getSessionAncestry).mockReturnValue([]);
});

describe("resolveAttribution", () => {
  it("returns agent from mode parameter", () => {
    const result = resolveAttribution("Coder", "sess-1");

    expect(result.agent).toBe("Coder");
  });

  it("returns depth 0 when no ancestry", () => {
    vi.mocked(getSessionAncestry).mockReturnValue([]);

    const result = resolveAttribution("Coder", "sess-1");

    expect(result.depth).toBe(0);
  });

  it("uses root initiator when available", () => {
    vi.mocked(getRootInitiator).mockReturnValue("Orchestrator");

    const result = resolveAttribution("Coder", "sess-1");

    expect(result.initiator).toBe("Orchestrator");
  });

  it("falls back to mode when no root initiator", () => {
    vi.mocked(getRootInitiator).mockReturnValue(null);
    vi.mocked(getSessionAncestry).mockReturnValue([]);

    const result = resolveAttribution("Coder", "sess-1");

    expect(result.initiator).toBe("Coder");
  });
});
