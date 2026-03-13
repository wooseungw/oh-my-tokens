/**
 * Provider plan definitions and per-provider limit management.
 *
 * Limits are configured in opencode.json under:
 *   experimental["oh-my-tokens"].providers.<name>.limits
 *
 * Each provider can have independent hourly / daily / weekly / monthly limits.
 * Example config:
 *
 *   "oh-my-tokens": {
 *     "providers": {
 *       "anthropic": {
 *         "plan": "claude-max-5",
 *         "limits": { "hourly": 10000000, "daily": 100000000, "monthly": 100000000 }
 *       },
 *       "openai": {
 *         "limits": { "daily": 20000000 }
 *       }
 *     }
 *   }
 *
 * If only "plan" is set (no "limits"), the preset's monthlyTokens is used as the monthly limit.
 * Any individual limit key overrides the preset for that time window.
 */

// ── Preset plan catalog ──────────────────────────────────────────────────────
// Token values are *approximate* — these plans are rate-limited, not hard-capped.
// Use explicit "limits" in config for accurate tracking.

export interface ProviderPlan {
  id: string;
  displayName: string;
  provider: string;
  monthlyUSD: number;
  /** Approximate monthly token budget (heuristic: $1 ≈ 1M tokens blended with cache). */
  monthlyTokens: number;
}

export const KNOWN_PLANS: ProviderPlan[] = [
  // ── Anthropic ──────────────────────────────────────────────────────────────
  {
    id: "claude-free",
    displayName: "Claude Free",
    provider: "anthropic",
    monthlyUSD: 0,
    monthlyTokens: 1_000_000,
  },
  {
    id: "claude-pro",
    displayName: "Claude Pro",
    provider: "anthropic",
    monthlyUSD: 20,
    monthlyTokens: 20_000_000,
  },
  {
    id: "claude-max-5",
    displayName: "Claude Max 5",
    provider: "anthropic",
    monthlyUSD: 100,
    monthlyTokens: 100_000_000,
  },
  {
    id: "claude-max-20",
    displayName: "Claude Max 20",
    provider: "anthropic",
    monthlyUSD: 200,
    monthlyTokens: 400_000_000,
  },

  // ── OpenAI ─────────────────────────────────────────────────────────────────
  {
    id: "chatgpt-free",
    displayName: "ChatGPT Free",
    provider: "openai",
    monthlyUSD: 0,
    monthlyTokens: 500_000,
  },
  {
    id: "chatgpt-plus",
    displayName: "ChatGPT Plus",
    provider: "openai",
    monthlyUSD: 20,
    monthlyTokens: 20_000_000,
  },
  {
    id: "chatgpt-pro",
    displayName: "ChatGPT Pro",
    provider: "openai",
    monthlyUSD: 200,
    monthlyTokens: 200_000_000,
  },

  // ── GitHub Copilot ─────────────────────────────────────────────────────────
  {
    id: "copilot-free",
    displayName: "Copilot Free",
    provider: "copilot",
    monthlyUSD: 0,
    monthlyTokens: 2_000_000,
  },
  {
    id: "copilot-individual",
    displayName: "Copilot Pro",
    provider: "copilot",
    monthlyUSD: 10,
    monthlyTokens: 12_000_000,
  },
  {
    id: "copilot-business",
    displayName: "Copilot Business",
    provider: "copilot",
    monthlyUSD: 19,
    monthlyTokens: 12_000_000,
  },
  {
    id: "copilot-enterprise",
    displayName: "Copilot Enterprise",
    provider: "copilot",
    monthlyUSD: 39,
    monthlyTokens: 40_000_000,
  },

  // ── Google ─────────────────────────────────────────────────────────────────
  {
    id: "gemini-free",
    displayName: "Gemini Free",
    provider: "google",
    monthlyUSD: 0,
    monthlyTokens: 15_000_000,
  },
  {
    id: "gemini-advanced",
    displayName: "Gemini Advanced",
    provider: "google",
    monthlyUSD: 20,
    monthlyTokens: 20_000_000,
  },

  // ── xAI / Grok ─────────────────────────────────────────────────────────────
  {
    id: "grok-x-premium",
    displayName: "X Premium",
    provider: "xai",
    monthlyUSD: 8,
    monthlyTokens: 8_000_000,
  },
  {
    id: "grok-x-premium-plus",
    displayName: "X Premium+",
    provider: "xai",
    monthlyUSD: 16,
    monthlyTokens: 16_000_000,
  },
  {
    id: "grok-api",
    displayName: "Grok API",
    provider: "xai",
    monthlyUSD: 25,
    monthlyTokens: 25_000_000,
  },

  // ── Groq ───────────────────────────────────────────────────────────────────
  {
    id: "groq-free",
    displayName: "Groq Free",
    provider: "groq",
    monthlyUSD: 0,
    monthlyTokens: 5_000_000,
  },
  {
    id: "groq-dev",
    displayName: "Groq Dev",
    provider: "groq",
    monthlyUSD: 9,
    monthlyTokens: 30_000_000,
  },

  // ── Perplexity ─────────────────────────────────────────────────────────────
  {
    id: "perplexity-free",
    displayName: "Perplexity Free",
    provider: "perplexity",
    monthlyUSD: 0,
    monthlyTokens: 500_000,
  },
  {
    id: "perplexity-pro",
    displayName: "Perplexity Pro",
    provider: "perplexity",
    monthlyUSD: 20,
    monthlyTokens: 20_000_000,
  },

  // ── Mistral ────────────────────────────────────────────────────────────────
  {
    id: "mistral-free",
    displayName: "Mistral Free",
    provider: "mistral",
    monthlyUSD: 0,
    monthlyTokens: 4_000_000,
  },
  {
    id: "mistral-premier",
    displayName: "Mistral Premier",
    provider: "mistral",
    monthlyUSD: 14,
    monthlyTokens: 50_000_000,
  },

  // ── DeepSeek ───────────────────────────────────────────────────────────────
  {
    id: "deepseek-free",
    displayName: "DeepSeek Free",
    provider: "deepseek",
    monthlyUSD: 0,
    monthlyTokens: 5_000_000,
  },
  {
    id: "deepseek-api",
    displayName: "DeepSeek API",
    provider: "deepseek",
    monthlyUSD: 0,
    monthlyTokens: 100_000_000,
  },
];

const PLAN_INDEX = new Map<string, ProviderPlan>(KNOWN_PLANS.map((p) => [p.id, p]));

export function lookupPlan(planId: string): ProviderPlan | null {
  return PLAN_INDEX.get(planId.trim().toLowerCase()) ?? null;
}

// ── Runtime config store (populated from opencode.json via config hook) ──────

export interface ProviderLimits {
  hourly?: number;
  daily?: number;
  weekly?: number;
  monthly?: number;
}

export interface ProviderConfig {
  plan?: string;
  limits?: ProviderLimits;
}

export interface ResolvedProviderConfig {
  planDisplayName: string | null;
  limits: ProviderLimits;
}

// Module-level store — set once during plugin init via setProviderConfigs()
let _providerConfigs: Record<string, ProviderConfig> = {};

export function setProviderConfigs(configs: Record<string, ProviderConfig>): void {
  _providerConfigs = configs;
}

export function getResolvedProviderConfig(providerName: string): ResolvedProviderConfig {
  const cfg = _providerConfigs[providerName.toLowerCase()] ?? {};
  const preset = cfg.plan !== undefined ? lookupPlan(cfg.plan) : null;
  const limits: ProviderLimits = {};
  if (preset !== null && cfg.limits?.monthly === undefined) {
    limits.monthly = preset.monthlyTokens;
  }
  if (cfg.limits?.hourly !== undefined) limits.hourly = cfg.limits.hourly;
  if (cfg.limits?.daily !== undefined) limits.daily = cfg.limits.daily;
  if (cfg.limits?.weekly !== undefined) limits.weekly = cfg.limits.weekly;
  if (cfg.limits?.monthly !== undefined) limits.monthly = cfg.limits.monthly;
  return { planDisplayName: preset?.displayName ?? null, limits };
}

export function hasAnyProviderLimits(): boolean {
  return Object.keys(_providerConfigs).length > 0;
}

export function getConfiguredProviderNames(): string[] {
  return Object.keys(_providerConfigs);
}
