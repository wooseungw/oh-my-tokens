const providerAliases = new Map<string, string>([
  ["copilot", "openai"],
  ["github-copilot", "openai"],
  ["copilot-chat", "openai"],
  ["vertexai", "google"],
]);

const standardProviders = new Set(["anthropic", "openai", "google", "groq", "xai", "local"]);

export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
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

export function lookupPricing(modelID: string): ModelPricing | null {
  const normalizedModelID = modelID.trim().toLowerCase();

  if (normalizedModelID.length === 0) {
    return null;
  }

  const exact = MODEL_PRICING[normalizedModelID];
  if (exact !== undefined) {
    return exact;
  }

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

export function estimateCost(
  modelID: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const pricing = lookupPricing(modelID);

  if (pricing === null) {
    return null;
  }

  return (
    inputTokens * (pricing.inputPer1M / 1_000_000) +
    outputTokens * (pricing.outputPer1M / 1_000_000)
  );
}
