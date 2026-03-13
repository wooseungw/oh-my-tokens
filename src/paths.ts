import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function trimEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function dedupe(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const candidate of paths) {
    if (candidate.length === 0 || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    result.push(candidate);
  }

  return result;
}

export function getDataDirCandidates(): string[] {
  const homeDir = homedir();
  const xdgDataHome = trimEnvValue(process.env.XDG_DATA_HOME);

  if (process.platform === "win32") {
    const localAppData = trimEnvValue(process.env.LOCALAPPDATA);
    const appData = trimEnvValue(process.env.APPDATA);

    return dedupe([
      ...(xdgDataHome === null ? [] : [path.join(xdgDataHome, "opencode")]),
      ...(localAppData === null ? [] : [path.join(localAppData, "opencode")]),
      ...(appData === null ? [] : [path.join(appData, "opencode")]),
      path.join(homeDir, ".local", "share", "opencode"),
    ]);
  }

  if (process.platform === "darwin") {
    return dedupe([
      ...(xdgDataHome === null ? [] : [path.join(xdgDataHome, "opencode")]),
      path.join(homeDir, ".local", "share", "opencode"),
      path.join(homeDir, "Library", "Application Support", "opencode"),
    ]);
  }

  return dedupe([
    ...(xdgDataHome === null ? [] : [path.join(xdgDataHome, "opencode")]),
    path.join(homeDir, ".local", "share", "opencode"),
    path.join(homeDir, ".config", "opencode"),
  ]);
}

export function findOpenCodeDbPath(): string | null {
  for (const candidate of getDataDirCandidates()) {
    const dbPath = path.join(candidate, "opencode.db");
    if (existsSync(dbPath)) {
      return dbPath;
    }
  }

  return null;
}

export function getOhMyTokensDataDir(): string {
  const existingOpenCodeDir = getDataDirCandidates().find((candidate) => existsSync(candidate));

  if (existingOpenCodeDir !== undefined) {
    return path.join(existingOpenCodeDir, "oh-my-tokens");
  }

  return path.join(homedir(), ".local", "share", "opencode", "oh-my-tokens");
}
