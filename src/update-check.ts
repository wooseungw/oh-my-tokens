import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getOhMyTokensDataDir } from "./paths";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;
const NPM_PACKAGE_URL = "https://registry.npmjs.org/oh-my-tokens/latest";

interface UpdateCache {
  checkedAt: number;
  latestVersion: string;
}

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
}

function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return (JSON.parse(readFileSync(pkgPath, "utf8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

function updateCachePath(): string {
  return path.join(getOhMyTokensDataDir(), "update-check.json");
}

function readUpdateCache(): UpdateCache | null {
  const p = updateCachePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as UpdateCache;
  } catch {
    return null;
  }
}

function writeUpdateCache(latestVersion: string): void {
  try {
    mkdirSync(getOhMyTokensDataDir(), { recursive: true });
    writeFileSync(
      updateCachePath(),
      JSON.stringify({ checkedAt: Date.now(), latestVersion }, null, 2),
      "utf8",
    );
  } catch {}
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(NPM_PACKAGE_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: unknown };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string): number[] => v.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const currentVersion = getCurrentVersion();
  const cache = readUpdateCache();

  let latestVersion: string | null;
  if (cache !== null && Date.now() - cache.checkedAt < CHECK_INTERVAL_MS) {
    latestVersion = cache.latestVersion;
  } else {
    latestVersion = await fetchLatestVersion();
    if (latestVersion !== null) writeUpdateCache(latestVersion);
  }

  if (latestVersion === null) return null;
  if (!isNewerVersion(latestVersion, currentVersion)) return null;
  return { currentVersion, latestVersion };
}
