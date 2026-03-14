import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AuthEntry {
  type?: string;
  access?: string;
  refresh?: string;
  expires?: number;
  accountId?: string;
  key?: string;
}

function isTokenExpired(entry: AuthEntry): boolean {
  return typeof entry.expires === "number" && entry.expires < Date.now();
}

export function getAuthJsonCandidatePaths(): string[] {
  const paths = [
    join(homedir(), ".local", "share", "opencode", "auth.json"),
    join(homedir(), ".config", "opencode", "auth.json"),
    join(homedir(), "Library", "Application Support", "opencode", "auth.json"),
  ];

  // Windows paths — only add if env vars are set
  const appData = process.env.APPDATA;
  if (appData) paths.push(join(appData, "opencode", "auth.json"));

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) paths.push(join(localAppData, "opencode", "auth.json"));

  return paths;
}

export function readAuthJson(): Record<string, AuthEntry> | null {
  for (const candidatePath of getAuthJsonCandidatePaths()) {
    try {
      return JSON.parse(readFileSync(candidatePath, "utf-8")) as Record<string, AuthEntry>;
    } catch {}
  }

  return null;
}

export function readAuthToken(provider: string): string | null {
  const auth = readAuthJson();
  const entry = auth?.[provider];
  if (!entry) return null;

  if (entry.type === "oauth") {
    if (isTokenExpired(entry)) {
      return null;
    }

    return entry.access ?? null;
  }

  if (entry.type === "api") return entry.key ?? null;
  return entry.access ?? entry.key ?? null;
}
