import type { FSWatcher } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthJsonCandidatePathsMock, readAuthJsonMock, existsSyncMock, watchMock } = vi.hoisted(
  () => ({
    getAuthJsonCandidatePathsMock: vi.fn<() => string[]>(() => [
      "/home/user/.config/opencode/auth.json",
    ]),
    readAuthJsonMock: vi.fn<() => Record<string, unknown> | null>(() => null),
    existsSyncMock: vi.fn<(target: string) => boolean>(() => false),
    watchMock: vi.fn(),
  }),
);

vi.mock("node:fs", () => ({
  existsSync: existsSyncMock,
  watch: watchMock,
}));

vi.mock("../../../src/enrichment/auth", () => ({
  getAuthJsonCandidatePaths: getAuthJsonCandidatePathsMock,
  readAuthJson: readAuthJsonMock,
}));

async function loadAuthWatcherModule() {
  vi.resetModules();
  return import("../../../src/enrichment/auth-watcher");
}

describe("auth watcher", () => {
  beforeEach(() => {
    vi.useRealTimers();
    getAuthJsonCandidatePathsMock.mockReset();
    getAuthJsonCandidatePathsMock.mockReturnValue(["/home/user/.config/opencode/auth.json"]);
    readAuthJsonMock.mockReset();
    readAuthJsonMock.mockReturnValue(null);
    existsSyncMock.mockReset();
    existsSyncMock.mockReturnValue(false);
    watchMock.mockReset();
  });

  it("initKnownAuthProviders does nothing when auth.json is null", async () => {
    const { initKnownAuthProviders } = await loadAuthWatcherModule();

    expect(() => initKnownAuthProviders()).not.toThrow();
  });

  it("initKnownAuthProviders seeds known providers before watcher callbacks", async () => {
    vi.useFakeTimers();
    existsSyncMock.mockReturnValue(true);

    let watchCallback: ((eventType: string, filename: string | Buffer | null) => void) | undefined;
    watchMock.mockImplementation(
      (
        _path: string,
        _options: { persistent: boolean },
        listener: (eventType: string, filename: string | Buffer | null) => void,
      ) => {
        watchCallback = listener;
        return { close: vi.fn() } as unknown as FSWatcher;
      },
    );
    readAuthJsonMock
      .mockReturnValueOnce({ anthropic: { access_token: "tok" } })
      .mockReturnValueOnce({
        anthropic: { access_token: "tok" },
        openai: { access_token: "tok-2" },
      });

    const { initKnownAuthProviders, setupAuthWatcher } = await loadAuthWatcherModule();

    initKnownAuthProviders();
    const onNewProvider = vi.fn();
    setupAuthWatcher(onNewProvider);
    watchCallback?.("change", "auth.json");
    vi.advanceTimersByTime(200);

    expect(onNewProvider).toHaveBeenCalledTimes(1);
    expect(onNewProvider).toHaveBeenCalledWith("openai");
  });

  it("setupAuthWatcher does not throw when directories do not exist", async () => {
    getAuthJsonCandidatePathsMock.mockReturnValue(["/nonexistent/auth.json"]);
    const { setupAuthWatcher } = await loadAuthWatcherModule();

    expect(() => setupAuthWatcher(() => {})).not.toThrow();
    expect(watchMock).not.toHaveBeenCalled();
  });
});
