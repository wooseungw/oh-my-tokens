import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, homedirMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(target: string) => boolean>(),
  homedirMock: vi.fn(() => "/home/tester"),
}));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
}));

vi.mock("node:os", () => ({
  homedir: homedirMock,
}));

const originalPlatform = process.platform;
const originalEnv = { ...process.env };

async function loadPathsModule() {
  vi.resetModules();
  return import("../../src/paths");
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

describe("paths", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    homedirMock.mockReturnValue("/home/tester");
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    process.env = { ...originalEnv };
  });

  it("returns linux candidates in the expected order", async () => {
    setPlatform("linux");
    process.env.XDG_DATA_HOME = "/tmp/xdg-data";

    const { getDataDirCandidates } = await loadPathsModule();

    expect(getDataDirCandidates()).toEqual([
      path.join("/tmp/xdg-data", "opencode"),
      path.join("/home/tester", ".local", "share", "opencode"),
      path.join("/home/tester", ".config", "opencode"),
    ]);
  });

  it("returns macos candidates with legacy and native fallbacks", async () => {
    setPlatform("darwin");

    const { getDataDirCandidates } = await loadPathsModule();

    expect(getDataDirCandidates()).toEqual([
      path.join("/home/tester", ".local", "share", "opencode"),
      path.join("/home/tester", "Library", "Application Support", "opencode"),
    ]);
  });

  it("returns windows candidates with local and roaming fallbacks", async () => {
    setPlatform("win32");
    homedirMock.mockReturnValue("C:\\Users\\tester");
    process.env.LOCALAPPDATA = "C:\\Users\\tester\\AppData\\Local";
    process.env.APPDATA = "C:\\Users\\tester\\AppData\\Roaming";

    const { getDataDirCandidates } = await loadPathsModule();

    expect(getDataDirCandidates()).toEqual([
      path.join("C:\\Users\\tester\\AppData\\Local", "opencode"),
      path.join("C:\\Users\\tester\\AppData\\Roaming", "opencode"),
      path.join("C:\\Users\\tester", ".local", "share", "opencode"),
    ]);
  });

  it("finds the first existing opencode db path", async () => {
    setPlatform("linux");
    existsSyncMock.mockImplementation(
      (target) => target === path.join("/home/tester", ".config", "opencode", "opencode.db"),
    );

    const { findOpenCodeDbPath } = await loadPathsModule();

    expect(findOpenCodeDbPath()).toBe(
      path.join("/home/tester", ".config", "opencode", "opencode.db"),
    );
  });

  it("places plugin data beside an existing opencode data directory", async () => {
    setPlatform("linux");
    existsSyncMock.mockImplementation(
      (target) => target === path.join("/home/tester", ".config", "opencode"),
    );

    const { getOhMyTokensDataDir } = await loadPathsModule();

    expect(getOhMyTokensDataDir()).toBe(
      path.join("/home/tester", ".config", "opencode", "oh-my-tokens"),
    );
  });

  it("falls back to the default linux-style plugin data dir", async () => {
    setPlatform("linux");
    existsSyncMock.mockReturnValue(false);

    const { getOhMyTokensDataDir } = await loadPathsModule();

    expect(getOhMyTokensDataDir()).toBe(
      path.join("/home/tester", ".local", "share", "opencode", "oh-my-tokens"),
    );
  });
});
