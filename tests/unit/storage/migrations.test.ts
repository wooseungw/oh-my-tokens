import { describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../../src/storage/migrations";

describe("runMigrations", () => {
  it("does not throw on empty database", () => {
    const db = {
      exec: vi.fn(),
      query: vi.fn(() => ({
        get: vi.fn(() => null),
        run: vi.fn(),
      })),
      transaction: vi.fn((fn: () => void) => fn),
    };

    expect(() => runMigrations(db)).not.toThrow();
  });

  it("is a function", () => {
    expect(typeof runMigrations).toBe("function");
  });
});
