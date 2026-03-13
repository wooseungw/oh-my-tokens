import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getDataDirCandidates } from "../paths";
import { execute, queryOne } from "../storage/db";

const CONFIG_HASH_KEY = "config_hash";

const TRACKED_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GITHUB_TOKEN",
  "GROQ_API_KEY",
] as const;

interface StateRow {
  value: string | null;
}

function buildConfigCandidatePaths(): string[] {
  const runtimeDirs = getDataDirCandidates().map((candidate) => candidate);

  return [
    path.join(process.cwd(), "opencode.jsonc"),
    path.join(process.cwd(), "opencode.json"),
    ...runtimeDirs.flatMap((candidate) => [
      path.join(candidate, "opencode.jsonc"),
      path.join(candidate, "opencode.json"),
    ]),
  ];
}

function readProvidersConfigSnapshot(): string {
  const snapshots: Array<{ path: string; content: string }> = [];

  for (const candidate of buildConfigCandidatePaths()) {
    if (!existsSync(candidate)) {
      continue;
    }

    try {
      snapshots.push({
        path: candidate,
        content: readFileSync(candidate, "utf8"),
      });
    } catch {
      snapshots.push({
        path: candidate,
        content: "[unreadable]",
      });
    }
  }

  return JSON.stringify(snapshots);
}

function readEnvPresenceSnapshot(): string {
  return JSON.stringify(
    Object.fromEntries(TRACKED_ENV_VARS.map((name) => [name, Boolean(process.env[name]?.trim())])),
  );
}

export function computeConfigHash(): string {
  return createHash("sha256")
    .update(readProvidersConfigSnapshot())
    .update(readEnvPresenceSnapshot())
    .digest("hex");
}

export function hasConfigChanged(): boolean {
  const currentHash = computeConfigHash();
  const previous = queryOne<StateRow>("SELECT value FROM state WHERE key = ?", CONFIG_HASH_KEY);

  if (previous?.value === currentHash) {
    return false;
  }

  execute(
    `
      INSERT INTO state (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `,
    CONFIG_HASH_KEY,
    currentHash,
  );

  return true;
}
