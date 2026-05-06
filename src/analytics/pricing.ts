import { getBundledFallbackCatalog, getCachedCatalog } from "./pricing-catalog";

const providerAliases = new Map<string, string>([
  ["github-copilot", "github-copilot"],
  ["copilot-chat", "github-copilot"],
  ["copilot", "github-copilot"],
  ["vertexai", "google-vertex"],
]);

const standardProviders = new Set([
  "anthropic",
  "openai",
  "google",
  "google-vertex",
  "groq",
  "xai",
  "openrouter",
  "deepseek",
  "mistral",
  "perplexity",
  "github-copilot",
  "amazon-bedrock",
  "azure",
  "vercel",
  "ollama",
  "lmstudio",
  "local",
]);

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M?: number;
  cacheWritePer1M?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-20250514": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3.5-sonnet": { inputPer1M: 3, outputPer1M: 15 },
  "claude-3.5-haiku": { inputPer1M: 0.8, outputPer1M: 4 },
  "claude-opus-4-20250514": { inputPer1M: 15, outputPer1M: 75 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10 },
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  o3: { inputPer1M: 10, outputPer1M: 40 },
  "o4-mini": { inputPer1M: 1.1, outputPer1M: 4.4 },
  "gemini-2.5-pro": { inputPer1M: 1.25, outputPer1M: 10 },
  "gemini-2.5-flash": { inputPer1M: 0.15, outputPer1M: 0.6 },
};

function inferProviderFromModel(modelID: string | undefined): string | null {
  if (modelID === undefined) {
    return null;
  }

  const lowered = modelID.trim().toLowerCase();
  if (lowered.length === 0) {
    return null;
  }

  const prefixedProvider = lowered.split("/")[0];
  if (prefixedProvider !== undefined && standardProviders.has(prefixedProvider)) {
    return prefixedProvider;
  }

  if (lowered.startsWith("claude")) {
    return "anthropic";
  }

  if (
    lowered.startsWith("gpt") ||
    lowered.startsWith("o1") ||
    lowered.startsWith("o3") ||
    lowered.startsWith("o4")
  ) {
    return "openai";
  }

  if (lowered.startsWith("gemini")) {
    return "google";
  }

  if (lowered.startsWith("grok")) {
    return "xai";
  }

  return null;
}

export function normalizePricingProvider(providerID: string, modelID: string): string {
  const normalizedProvider = providerID.trim().toLowerCase();

  if (normalizedProvider.length > 0) {
    const alias = providerAliases.get(normalizedProvider);
    if (alias !== undefined) {
      return alias;
    }

    if (standardProviders.has(normalizedProvider)) {
      return normalizedProvider;
    }
  }

  const inferredProvider = inferProviderFromModel(modelID);
  if (inferredProvider !== null) {
    return inferredProvider;
  }

  return normalizedProvider.length > 0 ? normalizedProvider : "unknown";
}

function toModelPricing(
  entry: { input?: number; output?: number; cache_read?: number; cache_write?: number } | undefined,
): ModelPricing | null {
  if (entry === undefined) return null;
  if (entry.input === undefined || entry.output === undefined) return null;
  const pricing: ModelPricing = {
    inputPer1M: entry.input,
    outputPer1M: entry.output,
  };
  if (entry.cache_read !== undefined) pricing.cacheReadPer1M = entry.cache_read;
  if (entry.cache_write !== undefined) pricing.cacheWritePer1M = entry.cache_write;
  return pricing;
}

function lookupFromStaticTable(modelID: string): ModelPricing | null {
  const normalizedModelID = modelID.trim().toLowerCase();
  if (normalizedModelID.length === 0) return null;

  const exact = MODEL_PRICING[normalizedModelID];
  if (exact !== undefined) return exact;

  const candidates = Object.entries(MODEL_PRICING).sort(
    ([leftModelID], [rightModelID]) => rightModelID.length - leftModelID.length,
  );

  for (const [knownModelID, pricing] of candidates) {
    if (normalizedModelID.startsWith(knownModelID) || knownModelID.startsWith(normalizedModelID)) {
      return pricing;
    }
  }

  return null;
}

function lookupFromCatalog(providerID: string | undefined, modelID: string): ModelPricing | null {
  const catalog = getCachedCatalog() ?? getBundledFallbackCatalog();
  if (catalog === null) return null;

  const normalizedModelID = modelID.trim();
  if (normalizedModelID.length === 0) return null;

  if (providerID !== undefined) {
    const provider = catalog.providers[providerID];
    if (provider !== undefined) {
      const direct = provider.models[normalizedModelID];
      const pricing = toModelPricing(direct);
      if (pricing !== null) return pricing;

      const lowered = normalizedModelID.toLowerCase();
      for (const [id, entry] of Object.entries(provider.models)) {
        if (id.toLowerCase() === lowered) {
          const match = toModelPricing(entry);
          if (match !== null) return match;
        }
      }
    }
  }

  for (const provider of Object.values(catalog.providers)) {
    const direct = provider.models[normalizedModelID];
    const pricing = toModelPricing(direct);
    if (pricing !== null) return pricing;
  }

  const lowered = normalizedModelID.toLowerCase();
  for (const provider of Object.values(catalog.providers)) {
    for (const [id, entry] of Object.entries(provider.models)) {
      if (id.toLowerCase() === lowered) {
        const match = toModelPricing(entry);
        if (match !== null) return match;
      }
    }
  }

  return null;
}

export function lookupPricing(modelID: string, providerID?: string): ModelPricing | null {
  const staticMatch = lookupFromStaticTable(modelID);
  if (staticMatch !== null) return staticMatch;
  return lookupFromCatalog(providerID, modelID);
}

export interface CostInputs {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export function estimateCost(
  modelID: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  providerID?: string,
): number | null {
  const pricing = lookupPricing(modelID, providerID);
  if (pricing === null) return null;

  const cacheReadRate = pricing.cacheReadPer1M ?? pricing.inputPer1M;
  const cacheWriteRate = pricing.cacheWritePer1M ?? pricing.inputPer1M;

  const regularInputTokens = Math.max(0, inputTokens - cacheReadTokens);

  return (
    (regularInputTokens * pricing.inputPer1M) / 1_000_000 +
    (cacheReadTokens * cacheReadRate) / 1_000_000 +
    (cacheWriteTokens * cacheWriteRate) / 1_000_000 +
    (outputTokens * pricing.outputPer1M) / 1_000_000
  );
}
