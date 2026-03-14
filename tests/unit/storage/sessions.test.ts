import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/storage/db", () => ({
  execute: vi.fn(),
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(() => null),
}));

import { execute, queryOne } from "../../../src/storage/db";
import {
  getRootInitiator,
  getSessionAncestry,
  markCompacted,
  upsertSession,
} from "../../../src/storage/sessions";

beforeEach(() => {
  vi.mocked(execute).mockReset();
  vi.mocked(queryOne).mockReset();
  vi.mocked(queryOne).mockReturnValue(null);
});

describe("upsertSession", () => {
  it("calls execute with session data", () => {
    upsertSession({ id: "sess-1", agent: "Coder" });

    expect(execute).toHaveBeenCalled();
  });
});

describe("getSessionAncestry", () => {
  it("returns empty array when session not found", () => {
    vi.mocked(queryOne).mockReturnValue(null);

    const result = getSessionAncestry("nonexistent");

    expect(result).toEqual([]);
  });

  it("returns single session when no parent", () => {
    vi.mocked(queryOne).mockReturnValue({
      agent: "Coder",
      compactedFrom: null,
      id: "sess-1",
      parentId: null,
      status: "active",
    });

    const result = getSessionAncestry("sess-1");

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("sess-1");
  });
});

describe("getRootInitiator", () => {
  it("returns null when no sessions found", () => {
    vi.mocked(queryOne).mockReturnValue(null);

    const result = getRootInitiator("nonexistent");

    expect(result).toBeNull();
  });

  it("returns agent from root session", () => {
    vi.mocked(queryOne).mockReturnValue({
      agent: "Orchestrator",
      compactedFrom: null,
      id: "sess-1",
      parentId: null,
      status: "active",
    });

    const result = getRootInitiator("sess-1");

    expect(result).toBe("Orchestrator");
  });
});

describe("markCompacted", () => {
  it("calls execute to update session status", () => {
    vi.mocked(queryOne).mockReturnValue(null);

    markCompacted("old-sess", "new-sess");

    expect(execute).toHaveBeenCalled();
  });
});
