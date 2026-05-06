import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findOhMyTokensConfigPathMock, findOpencodeConfigPathMock } = vi.hoisted(() => ({
  findOhMyTokensConfigPathMock: vi.fn(() => "/mock/oh-my-tokens.json"),
  findOpencodeConfigPathMock: vi.fn(() => "/mock/opencode.json"),
}));

vi.mock("../../../src/paths", () => ({
  findOhMyTokensConfigPath: findOhMyTokensConfigPathMock,
  findOpencodeConfigPath: findOpencodeConfigPathMock,
}));

import {
  applyOhMyTokensSetting,
  buildSettingCommandOutput,
  KEY_CANONICAL,
  SETTING_SPECS,
} from "../../../src/ui/commands/setting";

describe("setting commands", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "omt-setting-"));
    configPath = join(tmpDir, "oh-my-tokens.json");
    findOhMyTokensConfigPathMock.mockReturnValue(configPath);
    findOpencodeConfigPathMock.mockReturnValue(join(tmpDir, "opencode.json"));
  });

  afterEach(() => {
    rmSync(tmpDir, { force: true, recursive: true });
  });

  it("exports setting metadata", () => {
    expect(SETTING_SPECS.display).toBeDefined();
    expect(KEY_CANONICAL["toast.durationms"]).toBe("toast.durationMs");
  });

  it("applyOhMyTokensSetting writes top-level keys", () => {
    const result = applyOhMyTokensSetting(configPath, "display", "compact");

    expect(result.ok).toBe(true);
    expect(result.oldValue).toBeUndefined();
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ display: "compact" });
  });

  it("applyOhMyTokensSetting writes nested keys and preserves oldValue", () => {
    writeFileSync(configPath, JSON.stringify({ toast: { enabled: true } }));

    const result = applyOhMyTokensSetting(configPath, "toast.enabled", false);

    expect(result.ok).toBe(true);
    expect(result.oldValue).toBe(true);
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ toast: { enabled: false } });
  });

  it("buildSettingCommandOutput rejects invalid enum values", () => {
    const result = buildSettingCommandOutput("display minimal");

    expect(result).toContain("✗");
    expect(result).toContain("compact | normal | extend | text");
  });

  it("buildSettingCommandOutput applies canonical keys", () => {
    const result = buildSettingCommandOutput("toast.durationms 9000");

    expect(result).toContain("✓ toast.durationMs");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      toast: { durationMs: 9000 },
    });
  });

  it("buildSettingCommandOutput shows unit hint without [not yet implemented]", () => {
    const result = buildSettingCommandOutput("unit");

    expect(result).not.toContain("[not yet implemented]");
    expect(result).toContain("tokens | cost");
  });

  it("buildSettingCommandOutput treats lang as unknown setting", () => {
    const result = buildSettingCommandOutput("lang");

    expect(result).toContain("Unknown setting: lang");
  });

  it("buildSettingDisplay does not include lang row", () => {
    const result = buildSettingCommandOutput("");

    expect(result).toContain("unit");
    expect(result).not.toContain("lang");
  });

  it("buildSettingCommandOutput accepts toast.summary enum values", () => {
    const result = buildSettingCommandOutput("toast.summary session");

    expect(result).toContain("✓ toast.summary");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      toast: { summary: "session" },
    });
  });

  it("buildSettingCommandOutput rejects invalid toast.summary value", () => {
    const result = buildSettingCommandOutput("toast.summary daily");

    expect(result).toContain("✗");
    expect(result).toContain("off | total | session");
  });

  it("buildSettingDisplay shows toast.summary row", () => {
    const result = buildSettingCommandOutput("");

    expect(result).toContain("toast.summary");
    expect(result).toContain("off | total | session");
  });
});
