import type { PluginInput } from "@opencode-ai/plugin";

import { formatTokens } from "./formatter";

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

export async function showToast(input: PluginInput, data: ToastData): Promise<void> {
  await input.client.tui.showToast({
    body: {
      title: "oh-my-tokens",
      message: formatToastMessage(data),
      variant: "info",
      duration: 9000,
    },
  });
}
