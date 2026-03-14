import type { Database } from "bun:sqlite";
import { describe, expect, it, vi } from "vitest";

import { runMigrations } from "../../../src/storage/migrations";

function makeMockDb(): Database {
  return {
    exec: vi.fn(),
    query: vi.fn(() => ({
      get: vi.fn(() => null),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
    transaction: vi.fn((fn: () => void) => fn),
    close: vi.fn(),
  } as unknown as Database;
}

describe("runMigrations", () => {
  it("does not throw on empty database", () => {
    const db = makeMockDb();

    expect(() => runMigrations(db)).not.toThrow();
  });

  it("is a function", () => {
    expect(typeof runMigrations).toBe("function");
  });
});
