# Providers

The oh-my-tokens plugin tracks usage across various AI model providers by monitoring OpenCode's event stream. It automatically detects which providers you are using and, where possible, enriches this data with live quota information from official or unofficial APIs.

## Detection and Tracking

The plugin listens to the OpenCode event stream to capture token usage events. No manual configuration is required to start tracking tokens for any provider.

### Enrichment

Enrichment is the process of fetching real-time quota data from a provider's API. This allows the plugin to display your remaining balance and reset times in the `/omt` and `/omt limits` commands.

- **Local tracking**: Tokens are counted as OpenCode processes them.
- **Live quota**: The plugin calls the provider's API to get their current view of your usage.

Enriched data is cached for 5 minutes (TTL). A fetch is triggered on the first session startup and refreshed periodically.

## Provider Support

The following table summarizes the support status for different providers:

| Provider | Live Quota | API | Windows Available | Auth Method |
|---|---|---|---|---|
| anthropic | Yes | Official | 5-hour, 7-day (with reset times) | OAuth (auto-detected) or API key |
| openai | Yes | Unofficial | 1-hour, weekly (with reset times) | OAuth (auto-detected) or API key |
| copilot | Yes | Official | Monthly (premium request count) | OAuth via GitHub (auto-detected) |
| openrouter | Yes | Official | Rolling credit balance (no reset) | API key (auto-detected) |
| gemini | Est. | Unofficial | Daily RPD estimate (no live usage) | API key (auto-detected) |
| google | No | — | None (token tracking only) | — |
| others | No | — | None (token tracking only) | — |

### API Types
- **Official**: These providers offer a documented, public API for checking usage.
- **Unofficial**: These are reverse-engineered from application traffic. They are more likely to break if the provider updates their internal services.
- **Est.**: No live quota API is available via API key. The plugin probes the key for validity, then displays free-tier limits sourced from community reports (reddit.com/r/GoogleGeminiAI). Actual remaining requests are unknown, so usage is shown as a static estimate tagged `[est]`.

## Auto-Detection of Credentials

To fetch live quotas, the plugin needs your authentication details. It automatically reads the OpenCode credentials file located at `~/.local/share/opencode/auth.json`.

If it finds a valid OAuth token or API key for a supported provider, it will automatically enable enrichment for that provider unless configured otherwise in `opencode.json`.
