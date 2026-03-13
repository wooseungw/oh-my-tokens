const providerAliases = new Map<string, string>([
  ["github-copilot", "copilot"],
  ["copilot-chat", "copilot"],
  ["vertexai", "google"],
]);

const standardProviders = new Set(["anthropic", "openai", "google", "groq", "xai", "local"]);

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
