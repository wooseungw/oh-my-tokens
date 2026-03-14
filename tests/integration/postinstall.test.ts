import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

type OpencodeConfig = {
  experimental?: {
    "oh-my-tokens"?: Record<string, unknown>;
  };
  plugin?: string[];
};

type OhMyTokensConfig = {
  budget?: {
    timezone?: string;
  };
  enrichment?: string;
  unit?: string;
};

type PostinstallResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const postinstallScriptPath = join(repoRoot, "scripts", "postinstall.mjs");

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function runPostinstall(env: Record<string, string>): PostinstallResult {
  const result = spawnSync(process.execPath, [postinstallScriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

  return {
    exitCode: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  };
}

describe("postinstall integration", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "oh-my-tokens-postinstall-"));
  });

  afterEach(() => {
    rmSync(tempRoot, { force: true, recursive: true });
  });

  it("creates oh-my-tokens.json and registers the plugin on a fresh install", () => {
    const initCwd = join(tempRoot, "consumer-app");
    const xdgConfigHome = join(tempRoot, "xdg-config");
    const configDir = join(xdgConfigHome, "opencode");
    const opencodeConfigPath = join(configDir, "opencode.json");
    const omtConfigPath = join(configDir, "oh-my-tokens.json");
    mkdirSync(initCwd, { recursive: true });

    const result = runPostinstall({
      INIT_CWD: initCwd,
      XDG_CONFIG_HOME: xdgConfigHome,
      npm_config_global: "false",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(opencodeConfigPath)).toBe(true);
    expect(existsSync(omtConfigPath)).toBe(true);

    const opencodeConfig = readJsonFile<OpencodeConfig>(opencodeConfigPath);
    const omtConfig = readJsonFile<OhMyTokensConfig>(omtConfigPath);

    expect(opencodeConfig.plugin).toContain("oh-my-tokens");
    expect(omtConfig.enrichment).toBe("auto");
    expect(typeof omtConfig.budget?.timezone).toBe("string");
  });

  it("migrates legacy experimental settings into oh-my-tokens.json", () => {
    const initCwd = join(tempRoot, "consumer-app");
    const xdgConfigHome = join(tempRoot, "xdg-config");
    const configDir = join(xdgConfigHome, "opencode");
    const opencodeConfigPath = join(configDir, "opencode.json");
    const omtConfigPath = join(configDir, "oh-my-tokens.json");
    mkdirSync(initCwd, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      opencodeConfigPath,
      `${JSON.stringify(
        {
          experimental: {
            "oh-my-tokens": {
              enrichment: "manual",
              unit: "cost",
            },
          },
        } satisfies OpencodeConfig,
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = runPostinstall({
      INIT_CWD: initCwd,
      XDG_CONFIG_HOME: xdgConfigHome,
      npm_config_global: "false",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(omtConfigPath)).toBe(true);

    const opencodeConfig = readJsonFile<OpencodeConfig>(opencodeConfigPath);
    const omtConfig = readJsonFile<OhMyTokensConfig>(omtConfigPath);

    expect(opencodeConfig.plugin).toContain("oh-my-tokens");
    expect(omtConfig.enrichment).toBe("manual");
    expect(omtConfig.unit).toBe("cost");
  });

  it("preserves an existing oh-my-tokens.json on reinstall", () => {
    const initCwd = join(tempRoot, "consumer-app");
    const xdgConfigHome = join(tempRoot, "xdg-config");
    const configDir = join(xdgConfigHome, "opencode");
    const opencodeConfigPath = join(configDir, "opencode.json");
    const omtConfigPath = join(configDir, "oh-my-tokens.json");
    mkdirSync(initCwd, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      omtConfigPath,
      `${JSON.stringify(
        {
          enrichment: "off",
          unit: "tokens",
        } satisfies OhMyTokensConfig,
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = runPostinstall({
      INIT_CWD: initCwd,
      XDG_CONFIG_HOME: xdgConfigHome,
      npm_config_global: "false",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(opencodeConfigPath)).toBe(true);

    const opencodeConfig = readJsonFile<OpencodeConfig>(opencodeConfigPath);
    const omtConfig = readJsonFile<OhMyTokensConfig>(omtConfigPath);

    expect(opencodeConfig.plugin).toContain("oh-my-tokens");
    expect(omtConfig).toEqual({
      enrichment: "off",
      unit: "tokens",
    });
  });
});
