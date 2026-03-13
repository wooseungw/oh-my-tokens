import { describe, expect, it, vi } from "vitest";

import { formatToastMessage, showToast, type ToastData } from "../../src/ui/toast";

const sampleToast: ToastData = {
  think: 820,
  chat: 0,
  code: 1_800,
  total: 2_620,
  provider: "anthropic",
  model: "claude-sonnet-4",
};

describe("toast", () => {
  it("formats the expected two-line message", () => {
    expect(formatToastMessage(sampleToast)).toBe(
      "🧠 820  💬 0  ⌨️ 1.8K  = 2.6K tok\nanthropic / claude-sonnet-4",
    );
  });

  it("shows an info toast through the sdk client", async () => {
    const showToastMock = vi.fn().mockResolvedValue(true);
    const input = {
      client: {
        tui: {
          showToast: showToastMock,
        },
      },
    };

    await showToast(input as never, sampleToast);

    expect(showToastMock).toHaveBeenCalledWith({
      body: {
        title: "oh-my-tokens",
        message: "🧠 820  💬 0  ⌨️ 1.8K  = 2.6K tok\nanthropic / claude-sonnet-4",
        variant: "info",
        duration: 9000,
      },
    });
  });
});
