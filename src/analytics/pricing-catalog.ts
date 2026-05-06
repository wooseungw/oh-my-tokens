import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import bundledFallback from "./pricing-catalog.fallback.json" with { type: "json" };

export interface CatalogModelPricing {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

export interface CatalogProvider {
  models: Record<string, CatalogModelPricing>;
}

export interface PricingCatalog {
  source: string;
  fetched_at: string;
  provider_count?: number;
  model_count?: number;
  providers: Record<string, CatalogProvider>;
}

const DEFAULT_URL = "https://models.dev/api.json";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedCatalog: PricingCatalog | null = null;
let inFlight: Promise<PricingCatalog> | null = null;

function getPricingUrl(): string {
  const override = process.env.OMT_PRICING_URL?.trim();
  return override && override.length > 0 ? override : DEFAULT_URL;
}

function getCacheDir(): string {
  const xdgCache = process.env.XDG_CACHE_HOME?.trim();
  if (xdgCache && xdgCache.length > 0) {
    return path.join(xdgCache, "oh-my-tokens");
  }
  if (process.platform === "darwin") {
    return path.join(homedir(), "Library", "Caches", "oh-my-tokens");
  }
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData && localAppData.length > 0) {
      return path.join(localAppData, "oh-my-tokens", "cache");
    }
  }
  return path.join(homedir(), ".cache", "oh-my-tokens");
}

function getCachePath(): string {
  return path.join(getCacheDir(), "models.json");
}

function isOfflineMode(): boolean {
  const flag = process.env.OMT_PRICING_OFFLINE?.trim().toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseCatalog(raw: unknown): PricingCatalog | null {
  if (!isRecord(raw)) return null;

  let providersRaw: Record<string, unknown>;
  if (isRecord(raw.providers)) {
    providersRaw = raw.providers as Record<string, unknown>;
  } else {
    providersRaw = raw as Record<string, unknown>;
  }

  const providers: Record<string, CatalogProvider> = {};
  let modelCount = 0;

  for (const [providerID, providerValue] of Object.entries(providersRaw)) {
    if (!isRecord(providerValue)) continue;
    const modelsRaw = providerValue.models;
    if (!isRecord(modelsRaw)) continue;

    const models: Record<string, CatalogModelPricing> = {};
    for (const [modelID, modelValue] of Object.entries(modelsRaw)) {
      if (!isRecord(modelValue)) continue;
      const costRaw = isRecord(modelValue.cost) ? modelValue.cost : modelValue;

      const entry: CatalogModelPricing = {};
      const input = readFiniteNumber(costRaw.input);
      const output = readFiniteNumber(costRaw.output);
      const cacheRead = readFiniteNumber(costRaw.cache_read);
      const cacheWrite = readFiniteNumber(costRaw.cache_write);

      if (input !== undefined) entry.input = input;
      if (output !== undefined) entry.output = output;
      if (cacheRead !== undefined) entry.cache_read = cacheRead;
      if (cacheWrite !== undefined) entry.cache_write = cacheWrite;

      if (entry.input === undefined && entry.output === undefined) continue;

      models[modelID] = entry;
      modelCount += 1;
    }

    if (Object.keys(models).length === 0) continue;
    providers[providerID] = { models };
  }

  if (Object.keys(providers).length === 0) return null;

  return {
    source: typeof raw.source === "string" ? raw.source : DEFAULT_URL,
    fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : new Date(0).toISOString(),
    provider_count: Object.keys(providers).length,
    model_count: modelCount,
    providers,
  };
}

function readBundledFallback(): PricingCatalog {
  const parsed = parseCatalog(bundledFallback);
  if (parsed === null) {
    throw new Error("bundled pricing catalog fallback is invalid");
  }
  return parsed;
}

function readDiskCache(): PricingCatalog | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;
  try {
    const body = JSON.parse(readFileSync(cachePath, "utf8")) as unknown;
    return parseCatalog(body);
  } catch {
    return null;
  }
}

function isCacheFresh(catalog: PricingCatalog): boolean {
  const fetchedAt = Date.parse(catalog.fetched_at);
  if (!Number.isFinite(fetchedAt)) return false;
  return Date.now() - fetchedAt < CACHE_TTL_MS;
}

function writeDiskCache(catalog: PricingCatalog): void {
  try {
    const dir = getCacheDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(getCachePath(), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  } catch {
    // Cache write is best-effort.
  }
}

async function fetchFromNetwork(): Promise<PricingCatalog | null> {
  try {
    const url = getPricingUrl();
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return null;
    const body = (await response.json()) as unknown;
    const parsed = parseCatalog(body);
    if (parsed === null) return null;
    const withTimestamp: PricingCatalog = {
      ...parsed,
      source: url,
      fetched_at: new Date().toISOString(),
    };
    writeDiskCache(withTimestamp);
    return withTimestamp;
  } catch {
    return null;
  }
}

export interface LoadCatalogOptions {
  refresh?: boolean;
}

export async function loadPricingCatalog(
  options: LoadCatalogOptions = {},
): Promise<PricingCatalog> {
  if (!options.refresh && cachedCatalog !== null) {
    return cachedCatalog;
  }

  if (!options.refresh && inFlight !== null) {
    return inFlight;
  }

  const load = async (): Promise<PricingCatalog> => {
    if (isOfflineMode()) {
      const fallback = readBundledFallback();
      cachedCatalog = fallback;
      return fallback;
    }

    if (!options.refresh) {
      const disk = readDiskCache();
      if (disk !== null && isCacheFresh(disk)) {
        cachedCatalog = disk;
        return disk;
      }
    }

    const fresh = await fetchFromNetwork();
    if (fresh !== null) {
      cachedCatalog = fresh;
      return fresh;
    }

    const staleDisk = readDiskCache();
    if (staleDisk !== null) {
      cachedCatalog = staleDisk;
      return staleDisk;
    }

    const fallback = readBundledFallback();
    cachedCatalog = fallback;
    return fallback;
  };

  inFlight = load().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function getCachedCatalog(): PricingCatalog | null {
  return cachedCatalog;
}

export function resetPricingCatalogForTest(): void {
  cachedCatalog = null;
  inFlight = null;
}

export function getBundledFallbackCatalog(): PricingCatalog {
  return readBundledFallback();
}
