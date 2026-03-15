import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/storage/db", () => ({
  execute: vi.fn(),
  queryAll: vi.fn(() => []),
  queryOne: vi.fn(() => null),
  runInTransaction: vi.fn((fn: () => unknown) => fn()),
}));

vi.mock("../../../src/storage/rollup", () => ({
  getTodayRollups: vi.fn(() => []),
}));

vi.mock("../../../src/utils", () => ({
  todayDateKey: vi.fn(() => "2026-03-12"),
}));

vi.mock("../../../src/config/reader", () => ({
  getRetentionSetting: vi.fn(() => undefined),
}));

vi.mock("../../../src/ui/render", () => ({
  buildSectionRule: vi.fn((width: number) => "─".repeat(width)),
  maxContentWidth: vi.fn((title: string, ...lines: string[]) => {
    const allLines = [title, ...lines];
    return Math.max(...allLines.map((line) => line.length));
  }),
}));

import { getRetentionSetting } from "../../../src/config/reader";
import { execute, queryAll, queryOne, runInTransaction } from "../../../src/storage/db";
import { getTodayRollups } from "../../../src/storage/rollup";
import {
  buildExportOutput,
  buildStatusOutput,
  handleOmtRebuild,
} from "../../../src/ui/commands/misc";

interface RollupRow {
  date: string;
  kind: string;
  name: string;
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
  cost: number;
  count: number;
}

interface CountRow {
  count: number;
}

interface StateRow {
  value: string | null;
}

describe("buildExportOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("json format", () => {
    it("returns valid JSON with empty data", () => {
      vi.mocked(getTodayRollups).mockReturnValue([]);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed).toEqual({
        date: "2026-03-12",
        providers: [],
        agents: [],
        totals: {
          inp: 0,
          out: 0,
          think: 0,
          chat: 0,
          code: 0,
          cache_r: 0,
          cache_w: 0,
          events: 0,
        },
      });
    });

    it("includes providers array when provider rows exist", () => {
      const providerRows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "anthropic",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(providerRows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed.providers).toHaveLength(1);
      expect(parsed.providers[0].name).toBe("anthropic");
      expect(parsed.providers[0].inp).toBe(100);
    });

    it("includes agents array when agent rows exist", () => {
      const agentRows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "agent",
          name: "Coder",
          inp: 50,
          out: 100,
          think: 25,
          chat: 50,
          code: 25,
          cache_r: 5,
          cache_w: 2,
          cost: 0.25,
          count: 3,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(agentRows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed.agents).toHaveLength(1);
      expect(parsed.agents[0].name).toBe("Coder");
    });

    it("uses total row when present", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "anthropic",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
        {
          date: "2026-03-12",
          kind: "total",
          name: "*",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed.totals.inp).toBe(100);
      expect(parsed.totals.out).toBe(200);
      expect(parsed.totals.cache_r).toBe(10);
    });

    it("computes totals from provider rows when total row absent", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "anthropic",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
        {
          date: "2026-03-12",
          kind: "provider",
          name: "openai",
          inp: 50,
          out: 100,
          think: 25,
          chat: 50,
          code: 25,
          cache_r: 5,
          cache_w: 2,
          cost: 0.25,
          count: 3,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed.totals.inp).toBe(150);
      expect(parsed.totals.out).toBe(300);
      expect(parsed.totals.cache_r).toBe(15);
    });

    it("includes event count in totals", () => {
      vi.mocked(getTodayRollups).mockReturnValue([]);
      vi.mocked(queryAll).mockReturnValue([
        {
          key: "1",
          ts: 1000,
          ver: 1,
          sid: "s1",
          psid: null,
          pid: null,
          provider: "anthropic",
          model: "claude",
          agent: null,
          initiator: null,
          depth: 0,
          inp: 10,
          out: 20,
          reasoning: 0,
          cache_r: 0,
          cache_w: 0,
          think: 0,
          chat: 20,
          code: 0,
          tools: 0,
          cost: 0.1,
        },
        {
          key: "2",
          ts: 2000,
          ver: 1,
          sid: "s1",
          psid: null,
          pid: null,
          provider: "anthropic",
          model: "claude",
          agent: null,
          initiator: null,
          depth: 0,
          inp: 10,
          out: 20,
          reasoning: 0,
          cache_r: 0,
          cache_w: 0,
          think: 0,
          chat: 20,
          code: 0,
          tools: 0,
          cost: 0.1,
        },
      ]);

      const output = buildExportOutput("json");
      const parsed = JSON.parse(output);

      expect(parsed.totals.events).toBe(2);
    });
  });

  describe("csv format", () => {
    it("returns header row only for empty data", () => {
      vi.mocked(getTodayRollups).mockReturnValue([]);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");
      const lines = output.split("\n");

      expect(lines).toHaveLength(1);
      expect(lines[0]).toBe("date,kind,name,inp,out,think,chat,code,cache_r,cache_w,cost,count");
    });

    it("includes header and data rows", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "anthropic",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");
      const lines = output.split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe("date,kind,name,inp,out,think,chat,code,cache_r,cache_w,cost,count");
      expect(lines[1]).toBe("2026-03-12,provider,anthropic,100,200,50,100,50,10,5,0.5,5");
    });

    it("escapes values with commas", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "test,provider",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");
      const lines = output.split("\n");

      expect(lines[1]).toContain('"test,provider"');
    });

    it("escapes values with quotes", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: 'test"provider',
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");
      const lines = output.split("\n");

      expect(lines[1]).toContain('test""provider');
    });

    it("escapes values with newlines", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "test\nprovider",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");

      expect(output).toContain('"test\nprovider"');
    });

    it("handles multiple rows", () => {
      const rows: RollupRow[] = [
        {
          date: "2026-03-12",
          kind: "provider",
          name: "anthropic",
          inp: 100,
          out: 200,
          think: 50,
          chat: 100,
          code: 50,
          cache_r: 10,
          cache_w: 5,
          cost: 0.5,
          count: 5,
        },
        {
          date: "2026-03-12",
          kind: "provider",
          name: "openai",
          inp: 50,
          out: 100,
          think: 25,
          chat: 50,
          code: 25,
          cache_r: 5,
          cache_w: 2,
          cost: 0.25,
          count: 3,
        },
      ];
      vi.mocked(getTodayRollups).mockReturnValue(rows);
      vi.mocked(queryAll).mockReturnValue([]);

      const output = buildExportOutput("csv");
      const lines = output.split("\n");

      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain("anthropic");
      expect(lines[2]).toContain("openai");
    });
  });
});

describe("buildStatusOutput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows default state with no data", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("oh-my-tokens — Status");
    expect(output).toContain("Version");
    expect(output).toContain("Schema       v0");
    expect(output).toContain("Events       0");
    expect(output).toContain("Rollup rows  0");
    expect(output).toContain("Providers    none");
    expect(output).toContain("Session      test-session-id");
    expect(output).toContain("Retention    90 days");
  });

  it("shows correct event count when queryOne returns count", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockImplementation((query: string) => {
      if (query.includes("COUNT(*) AS count FROM events")) {
        return { count: 42 } as CountRow;
      }
      if (query.includes("COUNT(*) AS count FROM rollups")) {
        return { count: 0 } as CountRow;
      }
      return null;
    });
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Events       42");
  });

  it("shows correct rollup count when queryOne returns count", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockImplementation((query: string) => {
      if (query.includes("COUNT(*) AS count FROM events")) {
        return { count: 0 } as CountRow;
      }
      if (query.includes("COUNT(*) AS count FROM rollups")) {
        return { count: 15 } as CountRow;
      }
      return null;
    });
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Rollup rows  15");
  });

  it("shows schema version when queryOne returns it", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockImplementation((query: string) => {
      if (query.includes("FROM state WHERE key")) {
        return { value: "3" } as StateRow;
      }
      return null;
    });
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Schema       v3");
  });

  it("lists providers when rollup rows exist", () => {
    const rows: RollupRow[] = [
      {
        date: "2026-03-12",
        kind: "provider",
        name: "anthropic",
        inp: 100,
        out: 200,
        think: 50,
        chat: 100,
        code: 50,
        cache_r: 10,
        cache_w: 5,
        cost: 0.5,
        count: 5,
      },
      {
        date: "2026-03-12",
        kind: "provider",
        name: "openai",
        inp: 50,
        out: 100,
        think: 25,
        chat: 50,
        code: 25,
        cache_r: 5,
        cache_w: 2,
        cost: 0.25,
        count: 3,
      },
    ];
    vi.mocked(getTodayRollups).mockReturnValue(rows);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Providers    anthropic, openai");
  });

  it("sorts providers alphabetically", () => {
    const rows: RollupRow[] = [
      {
        date: "2026-03-12",
        kind: "provider",
        name: "zebra",
        inp: 100,
        out: 200,
        think: 50,
        chat: 100,
        code: 50,
        cache_r: 10,
        cache_w: 5,
        cost: 0.5,
        count: 5,
      },
      {
        date: "2026-03-12",
        kind: "provider",
        name: "apple",
        inp: 50,
        out: 100,
        think: 25,
        chat: 50,
        code: 25,
        cache_r: 5,
        cache_w: 2,
        cost: 0.25,
        count: 3,
      },
    ];
    vi.mocked(getTodayRollups).mockReturnValue(rows);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Providers    apple, zebra");
  });

  it("shows retention days from config when set", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(30);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Retention    30 days");
  });

  it("shows retention days from environment when config not set", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("test-session-id");

    expect(output).toContain("Retention    90 days");
  });

  it("includes session ID in output", () => {
    vi.mocked(getTodayRollups).mockReturnValue([]);
    vi.mocked(queryOne).mockReturnValue(null);
    vi.mocked(getRetentionSetting).mockReturnValue(undefined);

    const output = buildStatusOutput("my-custom-session-123");

    expect(output).toContain("Session      my-custom-session-123");
  });
});

describe("handleOmtRebuild", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted string with event and rollup counts", () => {
    vi.mocked(queryOne).mockImplementation((query: string) => {
      if (query.includes("COUNT(*) AS count FROM events")) {
        return { count: 100 } as CountRow;
      }
      if (query.includes("COUNT(*) AS count FROM rollups")) {
        return { count: 25 } as CountRow;
      }
      return null;
    });

    const output = handleOmtRebuild();

    expect(output).toBe("Rebuilt rollups: 100 events → 25 rollup rows");
  });

  it("calls execute with DELETE statement", () => {
    vi.mocked(queryOne).mockReturnValue({ count: 0 } as CountRow);

    handleOmtRebuild();

    expect(execute).toHaveBeenCalledWith("DELETE FROM rollups");
  });

  it("calls execute with INSERT statements", () => {
    vi.mocked(queryOne).mockReturnValue({ count: 0 } as CountRow);

    handleOmtRebuild();

    const calls = vi.mocked(execute).mock.calls;
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.some((call) => call[0].includes("INSERT INTO rollups"))).toBe(true);
  });

  it("runs in transaction", () => {
    vi.mocked(queryOne).mockReturnValue({ count: 0 } as CountRow);

    handleOmtRebuild();

    expect(runInTransaction).toHaveBeenCalled();
  });

  it("formats large numbers with commas", () => {
    vi.mocked(queryOne).mockImplementation((query: string) => {
      if (query.includes("COUNT(*) AS count FROM events")) {
        return { count: 1000000 } as CountRow;
      }
      if (query.includes("COUNT(*) AS count FROM rollups")) {
        return { count: 50000 } as CountRow;
      }
      return null;
    });

    const output = handleOmtRebuild();

    expect(output).toBe("Rebuilt rollups: 1,000,000 events → 50,000 rollup rows");
  });

  it("handles zero counts", () => {
    vi.mocked(queryOne).mockReturnValue({ count: 0 } as CountRow);

    const output = handleOmtRebuild();

    expect(output).toBe("Rebuilt rollups: 0 events → 0 rollup rows");
  });
});
