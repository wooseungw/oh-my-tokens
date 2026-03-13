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
} = vi.hoisted(() => ({
  normalizeDisplayProviderMock: vi.fn(() => "anthropic"),
  classifyMock: vi.fn(() => ({ think: 12, chat: 0, code: 80 })),
  recordEventMock: vi.fn(),
  upsertSessionMock: vi.fn(),
  markCompactedMock: vi.fn(),
  resolveAttributionMock: vi.fn(() => ({ agent: "coder", initiator: "coder", depth: 0 })),
  setCurrentSessionIdMock: vi.fn(),
  setLastReplyMock: vi.fn(),
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
});
