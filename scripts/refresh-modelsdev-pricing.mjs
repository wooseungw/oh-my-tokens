#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const MODELS_DEV_URL = process.env.OMT_PRICING_URL ?? "https://models.dev/api.json";
const OUT_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "src",
  "analytics",
  "pricing-catalog.fallback.json",
);

async function main() {
  process.stdout.write(`Fetching ${MODELS_DEV_URL} … `);
  const res = await fetch(MODELS_DEV_URL);
  if (!res.ok) {
    throw new Error(`models.dev fetch failed: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();
  process.stdout.write("ok\n");

  const providers = {};
  let providerCount = 0;
  let modelCount = 0;

  for (const [providerID, providerRaw] of Object.entries(raw)) {
    if (!providerRaw || typeof providerRaw !== "object") continue;
    const modelsRaw = providerRaw.models;
    if (!modelsRaw || typeof modelsRaw !== "object") continue;

    const models = {};
    for (const [modelID, modelRaw] of Object.entries(modelsRaw)) {
      if (!modelRaw || typeof modelRaw !== "object") continue;
      const cost = modelRaw.cost;
      if (!cost || typeof cost !== "object") continue;

      const entry = {};
      if (typeof cost.input === "number") entry.input = cost.input;
      if (typeof cost.output === "number") entry.output = cost.output;
      if (typeof cost.cache_read === "number") entry.cache_read = cost.cache_read;
      if (typeof cost.cache_write === "number") entry.cache_write = cost.cache_write;

      if (entry.input === undefined && entry.output === undefined) continue;

      models[modelID] = entry;
      modelCount += 1;
    }

    if (Object.keys(models).length === 0) continue;
    providers[providerID] = { models };
    providerCount += 1;
  }

  const catalog = {
    source: MODELS_DEV_URL,
    fetched_at: new Date().toISOString(),
    provider_count: providerCount,
    model_count: modelCount,
    providers,
  };

  await mkdir(path.dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  process.stdout.write(`Wrote ${OUT_PATH}\n`);
  process.stdout.write(`  providers: ${providerCount}\n  models: ${modelCount}\n`);
}

main().catch((err) => {
  process.stderr.write(`refresh-modelsdev-pricing failed: ${err.message ?? err}\n`);
  process.exit(1);
});
