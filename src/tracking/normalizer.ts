const providerAliases = new Map<string, string>([
  ["github-copilot", "copilot"],
  ["copilot-chat", "copilot"],
  ["github-copilot-chat", "copilot"],
  ["vertexai", "google"],
  ["google-vertex", "google"],
  ["bedrock", "amazon-bedrock"],
  ["aws-bedrock", "amazon-bedrock"],
]);

const standardProviders = new Set([
  "anthropic",
  "openai",
  "google",
  "groq",
  "xai",
  "openrouter",
  "deepseek",
  "mistral",
  "perplexity",
  "copilot",
  "amazon-bedrock",
  "azure",
  "vercel",
  "ollama",
  "lmstudio",
  "local",
]);

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

export function normalizeDisplayProvider(
  providerID: string | undefined,
  modelID: string | undefined,
): string {
  const normalizedProvider = providerID?.trim().toLowerCase();

  // When the model ID carries an explicit `upstream-provider/model-name` prefix, prefer the
  // upstream provider for display (e.g. openrouter → google/gemini-2.5-pro displays as
  // "google", since the underlying model origin is the more useful rollup key).
  const modelPrefixed = modelID?.trim().toLowerCase().includes("/") === true;
  if (modelPrefixed) {
    const inferredFromPrefix = inferProviderFromModel(modelID);
    if (inferredFromPrefix !== null) {
      return inferredFromPrefix;
    }
  }

  if (normalizedProvider !== undefined && normalizedProvider.length > 0) {
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

  if (normalizedProvider !== undefined && normalizedProvider.length > 0) {
    return normalizedProvider;
  }

  return "unknown";
}
