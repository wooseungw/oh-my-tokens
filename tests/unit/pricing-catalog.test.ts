import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getBundledFallbackCatalog,
  loadPricingCatalog,
  parseCatalog,
  resetPricingCatalogForTest,
} from "../../src/analytics/pricing-catalog";

describe("parseCatalog", () => {
  it("accepts the bundled-fallback shape ({providers: {...}})", () => {
    const catalog = parseCatalog({
      providers: {
        acme: {
          models: {
            "m-1": { input: 1, output: 2, cache_read: 0.1, cache_write: 0.5 },
          },
        },
      },
    });
    expect(catalog).not.toBeNull();
    expect(catalog?.providers.acme.models["m-1"]).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.1,
      cache_write: 0.5,
    });
  });

  it("accepts the raw models.dev shape (top-level keyed by provider)", () => {
    const catalog = parseCatalog({
      acme: {
        models: {
          "m-1": { cost: { input: 5, output: 10 } },
        },
      },
    });
    expect(catalog).not.toBeNull();
    expect(catalog?.providers.acme.models["m-1"]).toEqual({ input: 5, output: 10 });
  });

  it("rejects a malformed payload by returning null", () => {
    expect(parseCatalog(null)).toBeNull();
    expect(parseCatalog("not-a-catalog")).toBeNull();
    expect(parseCatalog({ providers: { broken: "not-an-object" } })).toBeNull();
  });

  it("drops entries that have neither input nor output pricing", () => {
    const catalog = parseCatalog({
      providers: {
        acme: {
          models: {
            "m-good": { input: 1, output: 2 },
            "m-bad": { attachment: true },
          },
        },
      },
    });
    expect(catalog?.providers.acme.models["m-good"]).toBeDefined();
    expect(catalog?.providers.acme.models["m-bad"]).toBeUndefined();
  });
});

describe("bundled fallback catalog", () => {
  it("ships a non-trivial provider set", () => {
    const catalog = getBundledFallbackCatalog();
    expect(Object.keys(catalog.providers).length).toBeGreaterThan(50);
    expect(catalog.providers.anthropic).toBeDefined();
    expect(catalog.providers.openai).toBeDefined();
    expect(catalog.providers.openrouter).toBeDefined();
  });
});

describe("loadPricingCatalog cache behavior", () => {
  const tempHome = path.join(tmpdir(), `omt-cache-${process.pid}-${Date.now()}`);
  const savedEnv: Record<string, string | undefined> = {};

  const saveEnv = (key: string) => {
    savedEnv[key] = process.env[key];
  };
  const restoreEnv = (key: string) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  };

  beforeEach(() => {
    saveEnv("OMT_PRICING_OFFLINE");
    saveEnv("OMT_PRICING_URL");
    saveEnv("XDG_CACHE_HOME");
    mkdirSync(tempHome, { recursive: true });
    process.env.XDG_CACHE_HOME = tempHome;
    resetPricingCatalogForTest();
  });

  afterEach(() => {
    restoreEnv("OMT_PRICING_OFFLINE");
    restoreEnv("OMT_PRICING_URL");
    restoreEnv("XDG_CACHE_HOME");
    rmSync(tempHome, { recursive: true, force: true });
    resetPricingCatalogForTest();
  });

  it("serves a fresh disk cache without hitting the network", async () => {
    const cacheDir = path.join(tempHome, "oh-my-tokens");
    mkdirSync(cacheDir, { recursive: true });
    const disk = {
      source: "disk://test",
      fetched_at: new Date().toISOString(),
      providers: {
        acme: { models: { "m-1": { input: 42, output: 84 } } },
      },
    };
    writeFileSync(path.join(cacheDir, "models.json"), JSON.stringify(disk), "utf8");
    process.env.OMT_PRICING_URL = "http://127.0.0.1:1/unreachable";

    const catalog = await loadPricingCatalog();
    expect(catalog.providers.acme.models["m-1"]).toEqual({ input: 42, output: 84 });
  });

  it("refreshes a stale disk cache via the network path (and tolerates failure)", async () => {
    const cacheDir = path.join(tempHome, "oh-my-tokens");
    mkdirSync(cacheDir, { recursive: true });
    const stale = {
      source: "disk://stale",
      fetched_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
      providers: {
        stale_provider: { models: { "stale-model": { input: 1, output: 2 } } },
      },
    };
    writeFileSync(path.join(cacheDir, "models.json"), JSON.stringify(stale), "utf8");
    process.env.OMT_PRICING_URL = "http://127.0.0.1:1/unreachable";

    const catalog = await loadPricingCatalog();
    // Network fails → falls back to stale disk cache (still usable) rather than crashing.
    expect(catalog.providers).toBeDefined();
    expect(Object.keys(catalog.providers).length).toBeGreaterThan(0);
  });

  it("falls back to bundled catalog when neither disk nor network yield a catalog", async () => {
    process.env.OMT_PRICING_URL = "http://127.0.0.1:1/unreachable";
    const catalog = await loadPricingCatalog();
    expect(Object.keys(catalog.providers).length).toBeGreaterThan(50);
    expect(catalog.providers.anthropic).toBeDefined();
  });

  it("skips the network entirely when OMT_PRICING_OFFLINE=1", async () => {
    process.env.OMT_PRICING_OFFLINE = "1";
    // Even with a valid-looking URL, offline mode must NOT call fetch.
    process.env.OMT_PRICING_URL = "http://127.0.0.1:1/should-not-be-called";
    const catalog = await loadPricingCatalog();
    expect(catalog.providers.anthropic).toBeDefined();
  });
});
