import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { AssistantMessage, Event } from "@opencode-ai/sdk";
import { computeTotalTokens } from "./analytics/token-math";
import { getCodeModes, getDisplaySetting, getToastConfig } from "./config/reader";
import { getSessionTotals, getTodayRollups } from "./storage/rollup";
import { markCompacted, upsertSession } from "./storage/sessions";
import { resolveAttribution } from "./tracking/attribution";
import { classify } from "./tracking/classifier";
import { normalizeDisplayProvider } from "./tracking/normalizer";
import { recordEvent } from "./tracking/recorder";
import { setCurrentSessionId, setLastReply } from "./ui/sidebar";
import { type SummaryToastData, showSummaryToast, showToast } from "./ui/toast";

function isAssistantMessage(
  message: Event["properties"] extends never ? never : unknown,
): message is AssistantMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    message.role === "assistant"
  );
}

function readOptionalStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const field = record[key];
  return typeof field === "string" && field.length > 0 ? field : undefined;
}

function readOptionalNumberField(value: unknown, key: string): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const field = record[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}

function readFirstStringField(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const field = readOptionalStringField(value, key);
    if (field !== undefined) {
      return field;
    }
  }

  return undefined;
}

let _codeModes: Set<string> | undefined;

function getCodeModesSet(): Set<string> {
  if (_codeModes === undefined) {
    _codeModes = getCodeModes();
  }
  return _codeModes;
}

function buildToolHeuristic(mode: string): number {
  return getCodeModesSet().has(mode) ? 1 : 0;
}

function handleCompaction(properties: Event["properties"]): void {
  const oldSessionId = readFirstStringField(properties, [
    "sessionID",
    "oldSessionID",
    "fromSessionID",
  ]);
  const newSessionId = readFirstStringField(properties, [
    "newSessionID",
    "compactedSessionID",
    "toSessionID",
  ]);

  if (oldSessionId !== undefined && newSessionId !== undefined) {
    markCompacted(oldSessionId, newSessionId);
    setCurrentSessionId(newSessionId);
  }
}

function buildSummaryFromSession(sessionId: string): SummaryToastData | null {
  const totals = getSessionTotals(sessionId);
  if (totals === null) return null;
  return {
    think: totals.think,
    chat: totals.chat,
    code: totals.code,
    inp: totals.inp,
    cache: totals.cache_r + totals.cache_w,
    total: computeTotalTokens(totals),
    count: totals.count,
  };
}

function buildSummaryFromToday(): SummaryToastData | null {
  const rows = getTodayRollups();
  const totalRow = rows.find((r) => r.kind === "total" && r.name === "*");
  if (totalRow === undefined) return null;
  return {
    think: totalRow.think,
    chat: totalRow.chat,
    code: totalRow.code,
    inp: totalRow.inp,
    cache: totalRow.cache_r + totalRow.cache_w,
    total: computeTotalTokens(totalRow),
    count: totalRow.count,
  };
}

function handleSessionIdle(
  input: PluginInput,
  properties: Event["properties"],
  lastSessionId: string | undefined,
): void {
  const toastCfg = getToastConfig();
  if (toastCfg.summary === "off") return;

  const sessionId = readOptionalStringField(properties, "sessionID") ?? lastSessionId;
  if (sessionId === undefined) return;

  const data =
    toastCfg.summary === "session" ? buildSummaryFromSession(sessionId) : buildSummaryFromToday();
  if (data === null) return;

  const displayMode = getDisplaySetting();
  showSummaryToast(input, data, displayMode, toastCfg.summary, toastCfg.durationMs).catch(() => {});
}

function handleMessageUpdated(input: PluginInput, message: AssistantMessage): void {
  const tools = buildToolHeuristic(message.mode);
  // TODO(Phase C.8): capture provider-specific generation IDs here (e.g. OpenRouter's
  // response `id`) so the verification runner can cross-check cost via
  // https://openrouter.ai/api/v1/generation?id=<id>. OpenCode's Message.Info does not yet
  // surface raw provider response IDs; upstream support must land before we can persist.
  const provider = normalizeDisplayProvider(message.providerID, message.modelID);
  const parentSessionId = readOptionalStringField(message, "parentSessionID");

  upsertSession({
    id: message.sessionID,
    parentId: parentSessionId,
    agent: message.mode,
  });

  const attribution = resolveAttribution(message.mode, message.sessionID, parentSessionId);
  const breakdown = classify({
    tokens: {
      output: message.tokens.output,
      reasoning: message.tokens.reasoning,
    },
    toolCallCount: tools,
  });

  const authoritativeTotal = readOptionalNumberField(message.tokens, "total");
  const fallbackTotal =
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cache.read +
    message.tokens.cache.write;

  recordEvent({
    key: message.id,
    ts: message.time.completed ?? message.time.created,
    sid: message.sessionID,
    psid: parentSessionId,
    pid: readOptionalStringField(message, "projectID"),
    provider,
    model: message.modelID,
    agent: attribution.agent,
    initiator: attribution.initiator,
    depth: attribution.depth,
    inp: message.tokens.input,
    out: message.tokens.output,
    reasoning: message.tokens.reasoning,
    cache_r: message.tokens.cache.read,
    cache_w: message.tokens.cache.write,
    think: breakdown.think,
    chat: breakdown.chat,
    code: breakdown.code,
    tools,
    cost: message.cost,
    total: authoritativeTotal ?? fallbackTotal,
  });

  setCurrentSessionId(message.sessionID);
  setLastReply({
    think: breakdown.think,
    chat: breakdown.chat,
    code: breakdown.code,
    cache: message.tokens.cache.read + message.tokens.cache.write,
    provider,
    model: message.modelID,
  });

  const toastCfg = getToastConfig();
  if (toastCfg.enabled && message.time.completed) {
    const toastData = {
      think: breakdown.think,
      chat: breakdown.chat,
      code: breakdown.code,
      total: breakdown.think + breakdown.chat + breakdown.code,
      provider,
      model: message.modelID,
    };
    showToast(input, toastData, toastCfg.durationMs).catch(() => {});
  }
}

export function createPipelineHooks(_input: PluginInput): Partial<Hooks> {
  let _lastSessionId: string | undefined;

  return {
    event: async ({ event }: { event: Event }) => {
      if (event.type === "session.idle") {
        handleSessionIdle(_input, event.properties, _lastSessionId);
        return;
      }

      if (event.type === "session.compacted") {
        handleCompaction(event.properties);
        return;
      }

      if (event.type !== "message.updated") {
        return;
      }

      const message = event.properties.info;
      if (!isAssistantMessage(message)) {
        return;
      }

      _lastSessionId = message.sessionID;
      handleMessageUpdated(_input, message);
    },
  };
}
