import { estimateCost } from "../analytics/pricing";
import {
  fetchAnthropicQuota,
  fetchCopilotQuota,
  fetchGeminiQuota,
  fetchOpenAIQuota,
  fetchOpenRouterQuota,
} from "../enrichment/providers";
import { fetchDeepSeekQuota } from "./deepseek";
import { verifyOpenRouterUsage } from "./openrouter";
import type { ProviderSpec, UsageRecord } from "./types";

const ANTHROPIC_TIERS = {
  free: 1_000_000,
  tier_1: 10_000_000,
  tier_2: 30_000_000,
  tier_3: 80_000_000,
  tier_4: 200_000_000,
  scale: 500_000_000,
} as const;

const OPENAI_TIERS = {
  tier_1: 10_000_000,
  tier_2: 100_000_000,
  tier_3: 300_000_000,
  tier_4: 1_000_000_000,
  tier_5: 5_000_000_000,
} as const;

function genericEstimateCost(
  record: Omit<UsageRecord, "recordedCost" | "generationId" | "timestamp">,
): number | null {
  return estimateCost(
    record.model,
    record.inputTokens,
    record.outputTokens,
    record.cacheReadTokens,
    record.cacheWriteTokens,
    record.provider,
  );
}

const anthropic: ProviderSpec = {
  id: "anthropic",
  displayName: "Anthropic",
  tier: "provider-api",
  authKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"],
  tierMonthlyEstimate: ANTHROPIC_TIERS,
  fetchQuota: fetchAnthropicQuota,
  estimateCost: genericEstimateCost,
};

const openai: ProviderSpec = {
  id: "openai",
  displayName: "OpenAI",
  tier: "provider-api",
  authKeys: ["OPENAI_API_KEY"],
  tierMonthlyEstimate: OPENAI_TIERS,
  fetchQuota: fetchOpenAIQuota,
  estimateCost: genericEstimateCost,
};

const copilot: ProviderSpec = {
  id: "github-copilot",
  displayName: "GitHub Copilot",
  tier: "subscription",
  authKeys: ["GITHUB_TOKEN", "COPILOT_API_KEY"],
  fetchQuota: fetchCopilotQuota,
  estimateCost: genericEstimateCost,
};

const gemini: ProviderSpec = {
  id: "gemini",
  displayName: "Google Gemini",
  tier: "response",
  authKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  fetchQuota: fetchGeminiQuota,
  estimateCost: genericEstimateCost,
};

const google: ProviderSpec = {
  id: "google",
  displayName: "Google",
  tier: "response",
  authKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  estimateCost: genericEstimateCost,
};

const openrouter: ProviderSpec = {
  id: "openrouter",
  displayName: "OpenRouter",
  tier: "provider-api",
  authKeys: ["OPENROUTER_API_KEY"],
  fetchQuota: fetchOpenRouterQuota,
  verifyUsage: verifyOpenRouterUsage,
  estimateCost: genericEstimateCost,
};

const groq: ProviderSpec = {
  id: "groq",
  displayName: "Groq",
  tier: "unverifiable",
  authKeys: ["GROQ_API_KEY"],
  estimateCost: genericEstimateCost,
};

const xai: ProviderSpec = {
  id: "xai",
  displayName: "xAI",
  tier: "unverifiable",
  authKeys: ["XAI_API_KEY"],
  estimateCost: genericEstimateCost,
};

const deepseek: ProviderSpec = {
  id: "deepseek",
  displayName: "DeepSeek",
  tier: "response",
  authKeys: ["DEEPSEEK_API_KEY"],
  fetchQuota: fetchDeepSeekQuota,
  estimateCost: genericEstimateCost,
};

const mistral: ProviderSpec = {
  id: "mistral",
  displayName: "Mistral",
  tier: "unverifiable",
  authKeys: ["MISTRAL_API_KEY"],
  estimateCost: genericEstimateCost,
};

const perplexity: ProviderSpec = {
  id: "perplexity",
  displayName: "Perplexity",
  tier: "unverifiable",
  authKeys: ["PERPLEXITY_API_KEY"],
  estimateCost: genericEstimateCost,
};

const bedrock: ProviderSpec = {
  id: "amazon-bedrock",
  displayName: "Amazon Bedrock",
  tier: "response",
  authKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"],
  estimateCost: genericEstimateCost,
};

const azure: ProviderSpec = {
  id: "azure",
  displayName: "Azure OpenAI",
  tier: "response",
  authKeys: ["AZURE_OPENAI_API_KEY", "AZURE_API_KEY"],
  estimateCost: genericEstimateCost,
};

const vercel: ProviderSpec = {
  id: "vercel",
  displayName: "Vercel AI Gateway",
  tier: "response",
  authKeys: ["VERCEL_API_KEY", "AI_GATEWAY_API_KEY"],
  estimateCost: genericEstimateCost,
};

const ollama: ProviderSpec = {
  id: "ollama",
  displayName: "Ollama",
  tier: "local",
  authKeys: [],
  estimateCost: () => 0,
};

const lmstudio: ProviderSpec = {
  id: "lmstudio",
  displayName: "LM Studio",
  tier: "local",
  authKeys: [],
  estimateCost: () => 0,
};

const genericFallback: ProviderSpec = {
  id: "__generic__",
  displayName: "Unknown Provider",
  tier: "response",
  authKeys: [],
  estimateCost: genericEstimateCost,
};

export const ALL_PROVIDERS: Record<string, ProviderSpec> = {
  [anthropic.id]: anthropic,
  [openai.id]: openai,
  [copilot.id]: copilot,
  [gemini.id]: gemini,
  [google.id]: google,
  [openrouter.id]: openrouter,
  [groq.id]: groq,
  [xai.id]: xai,
  [deepseek.id]: deepseek,
  [mistral.id]: mistral,
  [perplexity.id]: perplexity,
  [bedrock.id]: bedrock,
  [azure.id]: azure,
  [vercel.id]: vercel,
  [ollama.id]: ollama,
  [lmstudio.id]: lmstudio,
};

const PROVIDER_ALIASES: Record<string, string> = {
  copilot: "github-copilot",
  "copilot-chat": "github-copilot",
  "github-copilot-chat": "github-copilot",
  vertexai: "google",
  "google-vertex": "google",
  bedrock: "amazon-bedrock",
  "aws-bedrock": "amazon-bedrock",
};

export function getProvider(providerID: string | undefined): ProviderSpec {
  if (providerID === undefined) return genericFallback;
  const normalized = providerID.trim().toLowerCase();
  if (normalized.length === 0) return genericFallback;

  const aliased = PROVIDER_ALIASES[normalized];
  const resolved = aliased ?? normalized;
  return ALL_PROVIDERS[resolved] ?? genericFallback;
}

export function listProviderIds(): string[] {
  return Object.keys(ALL_PROVIDERS);
}

export function listAuthKeysForProvider(providerID: string): string[] {
  return getProvider(providerID).authKeys;
}

export { genericFallback };
