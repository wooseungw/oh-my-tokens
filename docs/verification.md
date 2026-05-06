# Verifying oh-my-tokens cost tracking

oh-my-tokens observes OpenCode's `message.updated` events and records the `cost` and `tokens.*`
fields OpenCode computes locally. These values are usually correct, but drift can happen when
pricing tables are out of sync, when cached-input tokens are billed differently than listed, or
when an upstream provider revises rates mid-billing-cycle. This document describes how to
cross-check the numbers against the ground truth each provider exposes.

## Tier map

Every provider carries a `VerificationTier` in [src/providers/registry.ts](../src/providers/registry.ts):

| Tier | Meaning | Providers |
|------|---------|-----------|
| `response` | Usage recorded from the response body is the authoritative per-request number; provider does not expose a separate per-request cost API. | `google`, `google-vertex`, `amazon-bedrock`, `azure`, `vercel`, `deepseek` |
| `provider-api` | Provider exposes a `/generation/:id` or admin Usage API for exact post-hoc cost. | `openrouter`, `openai`, `anthropic` |
| `subscription` | Request-based quota, no per-request dollars. Verify via quota counter. | `github-copilot` |
| `local` | No cost, tokens from response only. | `ollama`, `lmstudio` |
| `unverifiable` | No public cross-check endpoint; response `usage` is the only data. | `groq`, `xai`, `mistral`, `perplexity` |

## OpenRouter — the gold standard

OpenRouter is the easiest provider to verify because every generation has a unique ID and the
`/api/v1/generation` endpoint returns the exact billed amount.

### Manual check

1. Send a message through OpenCode configured to use OpenRouter.
2. Note the response ID. If OpenCode's `Message.Info` does not surface it today (tracked by the
   `TODO(Phase C.8)` comment in [src/pipeline.ts](../src/pipeline.ts)), grab it from OpenRouter's
   dashboard → Activity → copy the `gen-…` id.
3. Run:
   ```bash
   curl -sS "https://openrouter.ai/api/v1/generation?id=gen-XXXX" \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" | jq .data
   ```
4. Compare the `total_cost` field with the `cost` you see in `/omt today` for that message.
5. Tolerance: `|Δ| < $0.0001` OR `|Δ / actual| < 1%`.

### Programmatic check

The `verifyOpenRouterUsage` function in [src/providers/openrouter.ts](../src/providers/openrouter.ts)
performs the same comparison. `verifyRecords` in [src/verification/runner.ts](../src/verification/runner.ts)
applies it across a whole session, respecting the per-provider `verify` cadence.

Enable it once (per provider) with:
```
/omt setting providers.openrouter.verify all
```
Options: `off` (default) · `sample` (10% of records) · `all` (every record).

## OpenAI & Anthropic — admin Usage APIs

Both providers require an **admin** API key (`sk-admin-…` / `sk-ant-admin-…`). Use the existing
`fetchOpenAIQuota` / `fetchAnthropicQuota` paths that ship with oh-my-tokens. The Usage APIs
return bucketed aggregates (hourly/daily), so per-request matching is approximate.

- Anthropic: `GET https://api.anthropic.com/v1/organizations/usage_report/messages`
- OpenAI: `GET https://api.openai.com/v1/organization/usage/completions`

## DeepSeek — balance drift check

DeepSeek does not expose a per-request cost endpoint, but the user balance endpoint does give you
a running total:

```bash
curl -sS "https://api.deepseek.com/user/balance" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" | jq .
```

Run it before and after a session. The `total_balance` delta should roughly equal the sum of
`cost` for that session's DeepSeek messages (±5% to account for cache hit/miss accounting).

## Google Gemini / Groq / xAI / Mistral / Perplexity

No public per-request cost endpoints. The response `usage` field (already captured by OpenCode
and fed through oh-my-tokens) is the only source. If the numbers feel off, reconcile against the
provider dashboard.

## Bedrock / Azure / Vercel AI Gateway

These route through cloud provider billing. Per-request attribution comes from response headers
(Bedrock) or response metadata. Aggregate verification lives in your cloud billing console.

## Local (Ollama / LM Studio)

Cost is always `0`. The only thing to verify is that OpenCode reports correct token counts via
`prompt_eval_count` / `eval_count` (Ollama) or OpenAI-compatible `usage.*` (LM Studio).

## E2E harness

The tests gated behind `OMT_E2E=1` hit live provider APIs. They are opt-in because they need
credentials and cost real money. See `tests/e2e/` (future) for the OpenRouter generation
round-trip test, which is the canonical "does tracking work?" integration test.

## Pricing refresh

The pricing catalog ships bundled from `src/analytics/pricing-catalog.fallback.json` and refreshes
from `https://models.dev/api.json` at startup (24h TTL). To force a refresh:

```
/omt refresh-pricing         # in an OpenCode session
npm run pricing:refresh      # from a shell (regenerates the fallback JSON)
```

Privacy: set `OMT_PRICING_OFFLINE=1` to skip the network fetch and use the bundled fallback only.
