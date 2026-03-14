import { existsSync, watch } from "node:fs";
import { dirname } from "node:path";

import { getAuthJsonCandidatePaths, readAuthJson } from "./auth";

const _knownAuthProviders = new Set<string>();

export function initKnownAuthProviders(): void {
  const auth = readAuthJson();
  if (auth === null) return;

  for (const key of Object.keys(auth)) {
    _knownAuthProviders.add(key);
  }
}

export function setupAuthWatcher(onNewProvider: (provider: string) => void): void {
  const watchedDirs = [
    ...new Set(getAuthJsonCandidatePaths().map((candidatePath) => dirname(candidatePath))),
  ];
  let debounce: ReturnType<typeof setTimeout> | null = null;

  for (const dir of watchedDirs) {
    if (!existsSync(dir)) continue;

    watch(dir, { persistent: false }, (_eventType, filename) => {
      if (filename !== "auth.json") return;
      if (debounce !== null) clearTimeout(debounce);

      debounce = setTimeout(() => {
        debounce = null;
        const auth = readAuthJson();
        if (auth === null) return;

        for (const provider of Object.keys(auth)) {
          if (_knownAuthProviders.has(provider)) continue;
          _knownAuthProviders.add(provider);
          onNewProvider(provider);
        }
      }, 200);
    });
  }
}
