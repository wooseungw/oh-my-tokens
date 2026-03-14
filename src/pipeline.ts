import type { Hooks, PluginInput } from "@opencode-ai/plugin";
import type { AssistantMessage, Event } from "@opencode-ai/sdk";

import { getToastConfig } from "./config/reader";
import { markCompacted, upsertSession } from "./storage/sessions";
import { resolveAttribution } from "./tracking/attribution";
import { classify } from "./tracking/classifier";
import { normalizeDisplayProvider } from "./tracking/normalizer";
import { recordEvent } from "./tracking/recorder";
import { setCurrentSessionId, setLastReply } from "./ui/sidebar";
import { showToast } from "./ui/toast";

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

function readFirstStringField(value: unknown, keys: string[]): string | undefined {
  for (const key of keys) {
    const field = readOptionalStringField(value, key);
    if (field !== undefined) {
      return field;
    }
  }

  return undefined;
}

function isCodeMode(mode: string): boolean {
  return mode === "coder" || mode === "task";
}

function buildToolHeuristic(mode: string): number {
  return isCodeMode(mode) ? 1 : 0;
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

export function createPipelineHooks(_input: PluginInput): Partial<Hooks> {
  return {
    event: async ({ event }: { event: Event }) => {
      if (event.type === "session.idle") {
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

      const tools = buildToolHeuristic(message.mode);
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

      if (getToastConfig().enabled && message.time.completed) {
        const toastData = {
          think: breakdown.think,
          chat: breakdown.chat,
          code: breakdown.code,
          total: breakdown.think + breakdown.chat + breakdown.code,
          provider,
          model: message.modelID,
        };
        showToast(_input, toastData).catch(() => {});
      }
    },
  };
}
