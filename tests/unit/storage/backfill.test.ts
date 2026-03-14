import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOpenCodeDbPathMock, queryOneMock, recordEventMock, runInTransactionMock } = vi.hoisted(
  () => ({
    findOpenCodeDbPathMock: vi.fn(() => null),
    queryOneMock: vi.fn(() => null),
    recordEventMock: vi.fn(),
    runInTransactionMock: vi.fn((fn: () => unknown) => fn()),
  }),
);

vi.mock("../../../src/paths", () => ({
  findOpenCodeDbPath: findOpenCodeDbPathMock,
  getOhMyTokensDataDir: vi.fn(() => "/tmp/test"),
}));

vi.mock("../../../src/storage/db", () => ({
  queryOne: queryOneMock,
  runInTransaction: runInTransactionMock,
}));

vi.mock("../../../src/tracking/recorder", () => ({
  recordEvent: recordEventMock,
}));

import { runBackfill } from "../../../src/storage/backfill";

describe("runBackfill", () => {
  beforeEach(() => {
    findOpenCodeDbPathMock.mockReset();
    findOpenCodeDbPathMock.mockReturnValue(null);
    queryOneMock.mockReset();
    queryOneMock.mockReturnValue(null);
    recordEventMock.mockReset();
    runInTransactionMock.mockReset();
    runInTransactionMock.mockImplementation((fn: () => unknown) => fn());
  });

  it("returns 0 when no OpenCode DB is found", async () => {
    const result = await runBackfill();

    expect(result).toBe(0);
    expect(queryOneMock).toHaveBeenCalledWith(
      expect.stringContaining("SELECT MAX(ts) AS latestTs FROM events"),
    );
    expect(recordEventMock).not.toHaveBeenCalled();
    expect(runInTransactionMock).not.toHaveBeenCalled();
  });

  it("returns a promise", async () => {
    const result = runBackfill();

    expect(runBackfill).toBeInstanceOf(Function);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(0);
  });
});
