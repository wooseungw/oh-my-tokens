import { describe, expect, it } from "vitest";

import { classify } from "../../src/tracking/classifier";

describe("classify", () => {
  it("maps reasoning tokens directly to think", () => {
    expect(
      classify({
        tokens: { output: 120, reasoning: 35 },
        toolCallCount: 0,
      }),
    ).toEqual({
      think: 35,
      chat: 120,
      code: 0,
    });
  });

  it("treats output as chat tokens when no tools are used", () => {
    expect(
      classify({
        tokens: { output: 64, reasoning: 0 },
        toolCallCount: 0,
      }),
    ).toEqual({
      think: 0,
      chat: 64,
      code: 0,
    });
  });

  it("treats output as code tokens when tools are used", () => {
    expect(
      classify({
        tokens: { output: 88, reasoning: 12 },
        toolCallCount: 2,
      }),
    ).toEqual({
      think: 12,
      chat: 0,
      code: 88,
    });
  });
});
