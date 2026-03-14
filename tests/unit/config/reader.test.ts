import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractBudgetConfig, readPluginConfigFromFile } from "../../../src/config/reader";

describe("config reader", () => {
  it("readPluginConfigFromFile returns empty object for missing file", () => {
    const result = readPluginConfigFromFile("/nonexistent/path/oh-my-tokens.json");
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it("readPluginConfigFromFile reads valid JSON", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "omt-test-"));

    try {
      const configPath = join(tmpDir, "oh-my-tokens.json");
      writeFileSync(configPath, JSON.stringify({ display: "compact", enrichment: "auto" }));

      const result = readPluginConfigFromFile(configPath);
      expect(result.display).toBe("compact");
      expect(result.enrichment).toBe("auto");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("extractBudgetConfig returns defaults for empty config", () => {
    const result = extractBudgetConfig({});
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
    expect(result).toEqual({});
  });

  it("extractBudgetConfig extracts daily budget", () => {
    const result = extractBudgetConfig({ budget: { daily: 500000 } });
    expect(result.daily).toBe(500000);
  });
});
