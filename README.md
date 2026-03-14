# oh-my-tokens

[![npm version](https://img.shields.io/npm/v/oh-my-tokens.svg)](https://www.npmjs.com/package/oh-my-tokens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D%2018-brightgreen)](https://nodejs.org/)

**oh-my-tokens** is an OpenCode plugin for per-provider, per-agent token usage tracking and analysis. Track exactly which provider, agent, and task type (think/chat/code) consumed tokens in real time.

## Recent Updates

- `feat` Add /omt sessions command — top sessions by token usage
- `fix` Visual-aware padding for emoji labels, unified bar column per command
- `feat` Add formatCost and getUnitSetting for cost display mode

## Preview

**`/omt`** — Today's summary with live provider quotas and budget status:

```
oh-my-tokens — Today's Summary
─── anthropic ─── 19.5M today ──────────
  ⏱ 5h    ████░░░░░░░░░░░░   8%  resets 37m  [live]
  🗓 7d    ██░░░░░░░░░░░░░░   5%              [live]
─── openai ──────────────────────────────
  ⏱ 1h    ░░░░░░░░░░░░░░░░   0%  resets 4h 59m  [live]
  📆 wk   ██████░░░░░░░░░░  37%              [live]
─── Today ───────────────────────────────
  anthropic  ████████████████  99%   19.5M tok
  google     ░░░░░░░░░░░░░░░░   1%  319.0K tok
  copilot    ░░░░░░░░░░░░░░░░   0%  315.0K tok
─── Breakdown ───────────────────────────
  🧠 think    0 ( 0%)   💬 chat  37.2K ( 1%)
  ⌨️ code     0 ( 0%)   📥 input    95 ( 0%)
  📦 cache  13.1M (99%)   Σ total  13.2M
─── Budget ─────────────────────────────
  daily    ████░░░░░░░░░░░░  28%    13.2M /    50.0M  ✓
  pace     3.1M tok/h allowed  ·  9.8 req/h  (47 req today)
```

**`/omt agents`** — Per-agent token breakdown:

```
oh-my-tokens — Agent Usage
═══════════════════════════════════════
AGENTS
  Coder        ████████████░░░░  76%    9.8M tok
  Orchestrator ████░░░░░░░░░░░░  24%    3.2M tok
═══════════════════════════════════════
```

**`/omt trend`** — 7-day usage chart with week-over-week change:

```
oh-my-tokens — 7-Day Trend
═══════════════════════════════════════
DAILY USAGE
  2026-03-08  ████░░░░░░░░   2.1M
  2026-03-09  ██░░░░░░░░░░   1.3M
  2026-03-10  ░░░░░░░░░░░░      0
  2026-03-11  ████████░░░░   4.2M
  2026-03-12  ████████████   6.1M
  2026-03-13  ██████░░░░░░   3.4M
  2026-03-14  ████░░░░░░░░   2.2M
═══════════════════════════════════════
WoW  +18.2% (this week vs last week)
⚠️ Spike: 2026-03-12 (Z=2.3)
```

## Quick Start

1. **Install** the plugin:
   ```bash
   npm install oh-my-tokens
   ```
2. **Restart** OpenCode — postinstall automatically registers the plugin in `opencode.json`, detects your timezone, and creates `oh-my-tokens.json` next to your `opencode.json`.
3. **Type `/omt`** in any chat session to see today's token summary with live provider quotas.

Use `/omt agents` to see per-agent breakdowns, `/omt sessions` for top session activity, `/omt trend` for 7-day charts, or `/omt limits` to check provider quota windows directly.

## Features

- **Provider Tracking** — Separate token usage by provider (Anthropic, OpenAI, Copilot, etc.)
- **Agent Attribution** — Track which agent executed the request and which initiated it (execution vs. initiator)
- **Token Classification** — Classify tokens by type: think, chat, code, input, cache
- **Slash Commands** — `/omt`, `/omt agents`, `/omt sessions`, `/omt trend`, `/omt budget`, `/omt limits`, `/omt export`, `/omt status`, `/omt rebuild`
- **Budget Management** — Daily, weekly, monthly token budgets with alerts
- **Trend Analysis** — 7-day trends, week-over-week changes, spike detection
- **Enrichment Modes** — Optional provider quota integration (auto, manual, opencode-quota)
- **Toast Notifications** — Per-response token summary (configurable)
- **Zero Dependencies** — No npm packages; uses only Bun built-ins (fs, path, crypto, fetch, bun:sqlite)
- **SQLite WAL** — Atomic event recording + rollup updates in single transaction
- **Cross-Platform** — Linux, macOS, Windows with automatic data directory detection

## Supported Providers

| Provider | Tracking | Live Quota | API Status | Notes |
|---|---|---|---|---|
| anthropic | ✓ | ✓ | Official | OAuth: 5h + 7d windows with reset times via api.anthropic.com/api/oauth/usage |
| openai | ✓ | ✓ | Unofficial | ChatGPT OAuth: 1h + weekly windows via chatgpt.com backend (undocumented) |
| copilot | ✓ | ✓ | Official | Monthly premium request quota via GitHub billing API |
| openrouter | ✓ | ✓ | Official | Credit balance (rolling) via openrouter.ai/api/v1/credits |
| gemini | ✓ | Est. | Unofficial | API key probe + free-tier RPD estimate (~1K req/day) from community reports; actual remaining unknown |
| google | ✓ | — | — | Token tracking only |
| (any other) | ✓ | — | — | All OpenCode providers tracked; quota requires enrichment support |

## Installation

```bash
npm install oh-my-tokens
```

That's it. Postinstall automatically:
- Registers `oh-my-tokens` in your `opencode.json`
- Creates `oh-my-tokens.json` next to it with enrichment and timezone defaults

## Configuration

Settings live in `oh-my-tokens.json`, created automatically next to your `opencode.json`. On first install, postinstall writes a minimal config:

```jsonc
{
  "enrichment": "auto",
  "budget": {
    "timezone": "Asia/Seoul"  // auto-detected from your system
  }
}
```

You can extend it with any of the following options:

```jsonc
{
  // Display mode: "compact" | "normal" | "extend" | "text"
  "display": "normal",

  // Display unit: "tokens" (default) | "cost"
  "unit": "tokens",

  // Enrichment mode: "off" | "auto" | "manual" | "opencode-quota"
  "enrichment": "auto",

  // Token budgets
  "budget": {
    "daily": 500000,
    "weekly": 3000000,
    "monthly": 10000000,
    "timezone": "Asia/Seoul",
    "dailyResetHour": 0,
    "weeklyResetDay": "monday"
  },

  // Toast notifications
  "toast": {
    "enabled": true,
    "durationMs": 9000
  },

  // Language: "auto" | "en" | "ko" | "ja" | "zh"
  "lang": "auto",

  // Data retention (days)
  "retention": 90
}
```

> **Upgrading from <0.1.17?** Run `npm install oh-my-tokens` — postinstall automatically migrates your existing `opencode.json` settings to `oh-my-tokens.json`.

## Commands

| Command | Description |
|---------|-------------|
| `/omt` | Today's summary with live provider quotas, token classification, and budget status |
| `/omt agents` | Agent-by-agent breakdown with agent×model cross-analysis |
| `/omt sessions` | Top 15 sessions by token usage over the last 7 days |
| `/omt trend` | 7-day trend chart with week-over-week changes and spike detection |
| `/omt budget` | Budget status and remaining capacity |
| `/omt export [json\|csv]` | Export usage data in JSON or CSV format |
| `/omt status` | Diagnostic info (detected providers, database size, pricing data freshness) |
| `/omt limits` | Live provider quota windows with reset times |
| `/omt rebuild` | Rebuild rollup aggregates from events table |
| `/omt setting` | View all plugin settings from `oh-my-tokens.json` |
| `/omt setting <key>` | Show valid values and current value for a key |
| `/omt setting <key> <value>` | Update a setting (validated; shows preview for `display`) |

All command output is non-intrusive (`noReply: true`, `ignored: true`).

### Changing Settings via Command

Settings are stored in `oh-my-tokens.json`. Use `/omt setting` to view or change them:

```
/omt setting                              → show all current settings
/omt setting display                      → show valid values for 'display' + current value
/omt setting display text                 → set display mode (shows live preview immediately)
/omt setting unit cost                    → set display unit
/omt setting budget.daily 500000          → set daily token budget
/omt setting budget.timezone Asia/Seoul   → set reset timezone (IANA validated)
/omt setting budget.dailyResetHour 9      → set daily reset hour (0–23 validated)
/omt setting toast.enabled false          → disable toast notifications
```

Invalid values are rejected with a helpful error showing valid options.
Changes take effect after restarting OpenCode.

## Enrichment Modes

| Mode | Behavior | External Calls |
|------|----------|---|
| `off` | Local tracking only; no provider quotas | None |
| `auto` | Auto-detect quotas via auth.json tokens; show remaining capacity | 1 per provider / 5 min (cached) |
| `manual` | User-specified provider budgets in config | None |
| `opencode-quota` | Integrate with opencode-quota plugin; unified quota display | 1 per provider / 5 min (cached) |

**Note**: `opencode-quota` mode requires the opencode-quota plugin to be installed. If unavailable, automatically falls back to `auto` mode.

## How It Works

1. **Event Capture** — Hooks into `message.updated`, `session.idle`, `session.compacted` events
2. **Classification** — Categorizes tokens by type (think/chat/code) and task
3. **Attribution** — Tracks execution agent and initiator (root agent in delegation chain)
4. **Recording** — UPSERT events into SQLite with atomic rollup updates
5. **Analytics** — Aggregates by provider, agent, date; calculates trends and budgets
6. **Display** — Renders toast (per response) and commands

**Zero LLM overhead**: Plugin makes no API calls to LLMs, adds no tokens to context window, and uses only local data by default.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Commands

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript
npm run typecheck        # Type check only (tsc --noEmit)
npm test                 # Run tests (vitest)
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run format           # Auto-format with Biome
npm run lint             # Lint with Biome (no fixes)
npm run check            # Format + lint check (no fixes) — matches CI
```

### Pre-commit Hooks

Commits are validated with:
1. Biome format + lint
2. TypeScript type check
3. Test suite

Failing checks block the commit.

### Code Quality

- **Formatter**: Biome (unified format + lint)
- **Linter**: Biome with strict rules (no `any`, no unused imports)
- **Tests**: vitest with unit + integration coverage
- **CI**: Node.js 18/20/22 × Ubuntu/Windows/macOS matrix

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed contribution guidelines.

## License

MIT — See [LICENSE](./LICENSE) for details.

---

**Questions?** Open an [issue](https://github.com/wooseungw/oh-my-tokens/issues) or check the [docs](https://github.com/wooseungw/oh-my-tokens/tree/main/docs).
