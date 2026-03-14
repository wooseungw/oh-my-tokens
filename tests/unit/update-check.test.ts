import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { existsSyncMock, mkdirSyncMock, readFileSyncMock, writeFileSyncMock, getDataDirMock } =
  vi.hoisted(() => ({
    existsSyncMock: vi.fn<(target: string) => boolean>(() => false),
    mkdirSyncMock: vi.fn(),
    readFileSyncMock: vi.fn<(target: string, encoding: string) => string>(),
    writeFileSyncMock: vi.fn(),
    getDataDirMock: vi.fn(() => "/tmp/test-omt"),
  }));

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  mkdirSync: mkdirSyncMock,
  readFileSync: readFileSyncMock,
  writeFileSync: writeFileSyncMock,
}));

vi.mock("../../src/paths", () => ({
  getOhMyTokensDataDir: getDataDirMock,
}));

import { checkForUpdate } from "../../src/update-check";

describe("checkForUpdate", () => {
  beforeEach(() => {
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    mkdirSyncMock.mockReset();
    readFileSyncMock.mockReset();
    readFileSyncMock.mockImplementation((target) =>
      target.endsWith("package.json")
        ? '{"version":"0.1.0"}'
        : '{"checkedAt":0,"latestVersion":"0.0.0"}',
    );
    writeFileSyncMock.mockReset();
    getDataDirMock.mockReset();
    getDataDirMock.mockReturnValue("/tmp/test-omt");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null when fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network error"));

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it("returns null when already on latest version", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: "0.0.1" }), { status: 200 }),
    );

    await expect(checkForUpdate()).resolves.toBeNull();
  });

  it("returns update info when a newer version is available", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ version: "99.99.99" }), { status: 200 }),
    );

    await expect(checkForUpdate()).resolves.toEqual({
      currentVersion: "0.1.0",
      latestVersion: "99.99.99",
    });
    expect(mkdirSyncMock).toHaveBeenCalledWith("/tmp/test-omt", { recursive: true });
    expect(writeFileSyncMock).toHaveBeenCalledOnce();
  });

  it("returns null when fetch returns a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{}", { status: 500 }));

    await expect(checkForUpdate()).resolves.toBeNull();
  });
});
