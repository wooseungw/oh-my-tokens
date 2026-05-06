import type { PluginInput } from "@opencode-ai/plugin";

import { formatTokens } from "./formatter";
import type { DisplayMode } from "./sidebar";

export interface ToastData {
  think: number;
  chat: number;
  code: number;
  total: number;
  provider: string;
  model: string;
}

export function formatToastMessage(data: ToastData): string {
  return [
    `🧠 ${formatTokens(data.think)}  💬 ${formatTokens(data.chat)}  ⌨️ ${formatTokens(data.code)}  = ${formatTokens(data.total)} tok`,
    `${data.provider} / ${data.model}`,
  ].join("\n");
}

export async function showToast(
  input: PluginInput,
  data: ToastData,
  durationMs = 9000,
): Promise<void> {
  await input.client.tui.showToast({
    body: {
      title: "oh-my-tokens",
      message: formatToastMessage(data),
      variant: "info",
      duration: durationMs,
    },
  });
}

export interface SummaryToastData {
  think: number;
  chat: number;
  code: number;
  inp: number;
  cache: number;
  total: number;
  count: number;
}

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export function formatSummaryToastMessage(
  data: SummaryToastData,
  mode: DisplayMode,
  scope: "total" | "session",
): string {
  const label = scope === "session" ? "Session" : "Today";
  if (mode === "compact") {
    return `${label}: ${formatTokens(data.total)} tok`;
  }

  const line1 = `🧠 ${formatTokens(data.think)}  💬 ${formatTokens(data.chat)}  ⌨️ ${formatTokens(data.code)}  📦 ${formatTokens(data.cache)}`;

  if (mode === "normal") {
    return `${line1}\nΣ ${formatTokens(data.total)} tok  ·  ${label}`;
  }

  const line2 = [
    `🧠 ${pct(data.think, data.total)}`,
    `💬 ${pct(data.chat, data.total)}`,
    `⌨️ ${pct(data.code, data.total)}`,
    `📥 ${pct(data.inp, data.total)}`,
    `📦 ${pct(data.cache, data.total)}`,
  ].join("  ");
  return `${line1}\n${line2}\nΣ ${formatTokens(data.total)} tok  ·  ${data.count} req  ·  ${label}`;
}

export async function showSummaryToast(
  input: PluginInput,
  data: SummaryToastData,
  mode: DisplayMode,
  scope: "total" | "session",
  durationMs = 9000,
): Promise<void> {
  const title = scope === "session" ? "oh-my-tokens — Session" : "oh-my-tokens — Today";
  await input.client.tui.showToast({
    body: {
      title,
      message: formatSummaryToastMessage(data, mode, scope),
      variant: "info",
      duration: durationMs,
    },
  });
}
