import { afterEach, vi } from "vitest";

vi.mock("bun:sqlite", () => {
  const mockStatement = {
    all: vi.fn(() => []),
    get: vi.fn(() => null),
    run: vi.fn(),
  };

  class MockDatabase {
    query(_sql: string) {
      return mockStatement;
    }

    exec(_sql: string) {}

    close() {}

    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T {
      return fn;
    }
  }

  return { Database: MockDatabase };
});

afterEach(() => {
  vi.clearAllMocks();
});
