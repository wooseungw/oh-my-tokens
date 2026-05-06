import { describe, expect, it, vi } from "vitest";

import { getToastConfig } from "../../src/config/reader";
import {
  formatSummaryToastMessage,
  formatToastMessage,
  type SummaryToastData,
  showSummaryToast,
  showToast,
  type ToastData,
} from "../../src/ui/toast";

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

describe("getToastConfig", () => {
  it("returns enabled: true and durationMs: 9000 by default", () => {
    const config = getToastConfig();
    expect(config.enabled).toBe(true);
    expect(config.durationMs).toBe(9000);
  });

  it("returns enabled: false when config has toast.enabled: false", () => {
    const config = getToastConfig();
    expect(typeof config.enabled).toBe("boolean");
    expect(typeof config.durationMs).toBe("number");
  });

  it("returns summary: 'total' by default", () => {
    const config = getToastConfig();
    expect(config.summary).toBe("total");
  });
});

const sampleSummary: SummaryToastData = {
  think: 5_000,
  chat: 20_000,
  code: 10_000,
  inp: 100_000,
  cache: 500_000,
  total: 635_000,
  count: 42,
};

describe("formatSummaryToastMessage", () => {
  it("compact mode shows only total", () => {
    const msg = formatSummaryToastMessage(sampleSummary, "compact", "total");
    expect(msg).toBe("Today: 635.0K tok");
  });

  it("compact mode with session scope", () => {
    const msg = formatSummaryToastMessage(sampleSummary, "compact", "session");
    expect(msg).toBe("Session: 635.0K tok");
  });

  it("normal mode shows breakdown and total", () => {
    const msg = formatSummaryToastMessage(sampleSummary, "normal", "total");
    expect(msg).toContain("🧠 5.0K");
    expect(msg).toContain("💬 20.0K");
    expect(msg).toContain("⌨️ 10.0K");
    expect(msg).toContain("📦 500.0K");
    expect(msg).toContain("Σ 635.0K tok");
    expect(msg).toContain("Today");
  });

  it("extend mode shows percentages and request count", () => {
    const msg = formatSummaryToastMessage(sampleSummary, "extend", "session");
    expect(msg).toContain("📥");
    expect(msg).toContain("42 req");
    expect(msg).toContain("Session");
  });

  it("text mode behaves same as extend", () => {
    const text = formatSummaryToastMessage(sampleSummary, "text", "total");
    const extend = formatSummaryToastMessage(sampleSummary, "extend", "total");
    expect(text).toBe(extend);
  });
});

describe("showSummaryToast", () => {
  it("sends toast with correct title for total scope", async () => {
    const showToastMock = vi.fn().mockResolvedValue(true);
    const input = { client: { tui: { showToast: showToastMock } } };

    await showSummaryToast(input as never, sampleSummary, "normal", "total");

    expect(showToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "oh-my-tokens — Today",
          variant: "info",
        }),
      }),
    );
  });

  it("sends toast with correct title for session scope", async () => {
    const showToastMock = vi.fn().mockResolvedValue(true);
    const input = { client: { tui: { showToast: showToastMock } } };

    await showSummaryToast(input as never, sampleSummary, "normal", "session");

    expect(showToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          title: "oh-my-tokens — Session",
        }),
      }),
    );
  });
});
