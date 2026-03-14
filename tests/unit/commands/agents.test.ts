import { describe, expect, it } from "vitest";
import type { RollupRow } from "../../../src/storage/rollup";
import { buildAgentSummary } from "../../../src/ui/commands/agents";

describe("buildAgentSummary", () => {
  it("should be a function", () => {
    expect(typeof buildAgentSummary).toBe("function");
  });

  it("should return a string", () => {
    const rows: RollupRow[] = [];
    const result = buildAgentSummary(rows, false);
    expect(typeof result).toBe("string");
  });
});
