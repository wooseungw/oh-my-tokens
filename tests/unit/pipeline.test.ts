import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  normalizeDisplayProviderMock,
  classifyMock,
  recordEventMock,
  upsertSessionMock,
  markCompactedMock,
  resolveAttributionMock,
  setCurrentSessionIdMock,
  setLastReplyMock,
  getToastConfigMock,
  showToastMock,
  getCodeModesMock,
} = vi.hoisted(() => ({
  normalizeDisplayProviderMock: vi.fn(() => "anthropic"),
  classifyMock: vi.fn(() => ({ think: 12, chat: 0, code: 80 })),
  recordEventMock: vi.fn(),
  upsertSessionMock: vi.fn(),
  markCompactedMock: vi.fn(),
  resolveAttributionMock: vi.fn(() => ({ agent: "coder", initiator: "coder", depth: 0 })),
  setCurrentSessionIdMock: vi.fn(),
  setLastReplyMock: vi.fn(),
  getToastConfigMock: vi.fn(() => ({ enabled: false, durationMs: 9000 })),
  showToastMock: vi.fn(() => Promise.resolve()),
  getCodeModesMock: vi.fn(() => new Set(["coder"])),
}));

vi.mock("../../src/tracking/normalizer", () => ({
  normalizeDisplayProvider: normalizeDisplayProviderMock,
}));

vi.mock("../../src/tracking/classifier", () => ({
  classify: classifyMock,
}));

vi.mock("../../src/tracking/recorder", () => ({
  recordEvent: recordEventMock,
}));

vi.mock("../../src/storage/sessions", () => ({
  upsertSession: upsertSessionMock,
  markCompacted: markCompactedMock,
}));

vi.mock("../../src/tracking/attribution", () => ({
  resolveAttribution: resolveAttributionMock,
}));

vi.mock("../../src/ui/sidebar", () => ({
  setCurrentSessionId: setCurrentSessionIdMock,
  setLastReply: setLastReplyMock,
}));

vi.mock("../../src/config/reader", () => ({
  getToastConfig: getToastConfigMock,
  getCodeModes: getCodeModesMock,
}));

vi.mock("../../src/ui/toast", () => ({
  showToast: showToastMock,
}));

import { createPipelineHooks } from "../../src/pipeline";

describe("createPipelineHooks", () => {
  beforeEach(() => {
    normalizeDisplayProviderMock.mockClear();
    classifyMock.mockClear();
    recordEventMock.mockClear();
    upsertSessionMock.mockClear();
    markCompactedMock.mockClear();
    resolveAttributionMock.mockClear();
    setCurrentSessionIdMock.mockClear();
    setLastReplyMock.mockClear();
    getToastConfigMock.mockClear();
    showToastMock.mockClear();
    getToastConfigMock.mockReturnValue({ enabled: false, durationMs: 9000 });
  });

  it("records assistant message updates", async () => {
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_1",
            sessionID: "ses_1",
            role: "assistant",
            parentID: "msg_0",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "coder",
            path: {
              cwd: "/workspace",
              root: "/workspace",
            },
            cost: 0.32,
            tokens: {
              input: 120,
              output: 80,
              reasoning: 12,
              cache: { read: 5, write: 3 },
            },
            time: { created: 1000, completed: 1500 },
          },
        },
      },
    });

    expect(classifyMock).toHaveBeenCalledWith({
      tokens: { output: 80, reasoning: 12 },
      toolCallCount: 1,
    });
    expect(upsertSessionMock).toHaveBeenCalledWith({
      id: "ses_1",
      parentId: undefined,
      agent: "coder",
    });
    expect(resolveAttributionMock).toHaveBeenCalledWith("coder", "ses_1", undefined);
    expect(recordEventMock).toHaveBeenCalledWith({
      key: "msg_1",
      ts: 1500,
      sid: "ses_1",
      psid: undefined,
      pid: undefined,
      provider: "anthropic",
      model: "claude-sonnet-4",
      agent: "coder",
      initiator: "coder",
      depth: 0,
      inp: 120,
      out: 80,
      reasoning: 12,
      cache_r: 5,
      cache_w: 3,
      think: 12,
      chat: 0,
      code: 80,
      tools: 1,
      cost: 0.32,
      total: 220,
    });
    expect(setCurrentSessionIdMock).toHaveBeenCalledWith("ses_1");
    expect(setLastReplyMock).toHaveBeenCalledWith({
      think: 12,
      chat: 0,
      code: 80,
      cache: 8,
      provider: "anthropic",
      model: "claude-sonnet-4",
    });
  });

  it("ignores non-assistant messages", async () => {
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_2",
            sessionID: "ses_1",
            role: "user",
            parts: [],
            time: { created: 1000 },
          },
        },
      } as never,
    });

    expect(classifyMock).not.toHaveBeenCalled();
    expect(recordEventMock).not.toHaveBeenCalled();
  });

  it("no-ops for idle events and tracks compaction events", async () => {
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "session.idle",
        properties: { sessionID: "ses_1" },
      } as never,
    });
    await hooks.event?.({
      event: {
        type: "session.compacted",
        properties: { sessionID: "ses_1", newSessionID: "ses_2" },
      } as never,
    });

    expect(recordEventMock).not.toHaveBeenCalled();

    expect(markCompactedMock).toHaveBeenCalledWith("ses_1", "ses_2");
    expect(setCurrentSessionIdMock).toHaveBeenCalledWith("ses_2");
  });

  it("shows toast with output-only total on completed messages", async () => {
    getToastConfigMock.mockReturnValue({ enabled: true, durationMs: 9000 });
    recordEventMock.mockReturnValue(true);
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_t1",
            sessionID: "ses_1",
            role: "assistant",
            parentID: "msg_0",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "coder",
            path: { cwd: "/workspace", root: "/workspace" },
            cost: 0.1,
            tokens: {
              input: 500,
              output: 80,
              reasoning: 12,
              cache: { read: 200, write: 50 },
            },
            time: { created: Date.now() - 1000, completed: Date.now() },
          },
        },
      },
    });

    expect(showToastMock).toHaveBeenCalledOnce();
    expect(showToastMock).toHaveBeenCalledWith(
      expect.anything(),
      {
        think: 12,
        chat: 0,
        code: 80,
        total: 92,
        provider: "anthropic",
        model: "claude-sonnet-4",
      },
      9000,
    );
  });

  it("skips toast for incomplete (streaming) messages", async () => {
    getToastConfigMock.mockReturnValue({ enabled: true, durationMs: 9000 });
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_t2",
            sessionID: "ses_1",
            role: "assistant",
            parentID: "msg_0",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "coder",
            path: { cwd: "/workspace", root: "/workspace" },
            cost: 0,
            tokens: {
              input: 100,
              output: 30,
              reasoning: 0,
              cache: { read: 0, write: 0 },
            },
            time: { created: 1000 },
          },
        },
      },
    });

    expect(showToastMock).not.toHaveBeenCalled();
    expect(recordEventMock).toHaveBeenCalled();
  });

  it("skips toast for replayed messages (fork)", async () => {
    getToastConfigMock.mockReturnValue({ enabled: true, durationMs: 9000 });
    recordEventMock.mockReturnValue(false);
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_replay",
            sessionID: "ses_1",
            role: "assistant",
            parentID: "msg_0",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "coder",
            path: { cwd: "/workspace", root: "/workspace" },
            cost: 0.1,
            tokens: {
              input: 500,
              output: 80,
              reasoning: 12,
              cache: { read: 200, write: 50 },
            },
            time: { created: 1000, completed: 1500 },
          },
        },
      },
    });

    expect(recordEventMock).toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });

  it("skips toast for stale completions (fork with new message IDs)", async () => {
    getToastConfigMock.mockReturnValue({ enabled: true, durationMs: 9000 });
    recordEventMock.mockReturnValue(true);
    const hooks = createPipelineHooks({} as never);

    await hooks.event?.({
      event: {
        type: "message.updated",
        properties: {
          info: {
            id: "msg_fork",
            sessionID: "ses_fork",
            role: "assistant",
            parentID: "msg_0",
            modelID: "claude-sonnet-4",
            providerID: "anthropic",
            mode: "coder",
            path: { cwd: "/workspace", root: "/workspace" },
            cost: 0.1,
            tokens: {
              input: 500,
              output: 80,
              reasoning: 12,
              cache: { read: 200, write: 50 },
            },
            time: { created: 1000, completed: 2000 },
          },
        },
      },
    });

    expect(recordEventMock).toHaveBeenCalled();
    expect(showToastMock).not.toHaveBeenCalled();
  });
});
