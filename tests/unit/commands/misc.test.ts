import { describe, expect, it, vi } from "vitest";

vi.mock("../../../src/storage/db", () => ({
  execute: vi.fn(),
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(() => null),
  runInTransaction: (fn: () => unknown) => fn(),
}));

vi.mock("../../../src/storage/rollup", () => ({
  getTodayRollups: vi.fn(() => []),
}));

vi.mock("../../../src/utils", () => ({
  todayDateKey: vi.fn(() => "2026-03-12"),
}));

import {
  buildExportOutput,
  buildStatusOutput,
  handleOmtRebuild,
} from "../../../src/ui/commands/misc";

describe("misc commands", () => {
  it("buildStatusOutput should be a function", () => {
    expect(typeof buildStatusOutput).toBe("function");
  });

  it("buildExportOutput should be a function", () => {
    expect(typeof buildExportOutput).toBe("function");
  });

  it("handleOmtRebuild should be a function", () => {
    expect(typeof handleOmtRebuild).toBe("function");
  });
});
