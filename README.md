# oh-my-tokens

[![npm version](https://img.shields.io/npm/v/oh-my-tokens.svg)](https://www.npmjs.com/package/oh-my-tokens)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js >= 18](https://img.shields.io/badge/Node.js-%3E%3D%2018-brightgreen)](https://nodejs.org/)

**oh-my-tokens** is an OpenCode plugin for per-provider, per-agent token usage tracking and analysis. Track exactly which provider, agent, and task type (think/chat/code) consumed tokens in real time.

## Features

- **Provider Tracking** — Separate token usage by provider (Anthropic, OpenAI, Copilot, etc.)
- **Agent Attribution** — Track which agent executed the request and which initiated it (execution vs. initiator)
- **Token Classification** — Classify tokens by type: think, chat, code, input, cache
- **3-Level Sidebar Display** — Compact (3 rows), Normal (7–10 rows), Extended (12–16 rows)
- **Slash Commands** — `/omt`, `/omt agents`, `/omt trend`, `/omt budget`, `/omt export`, `/omt status`, `/omt rebuild`
- **Budget Management** — Daily, weekly, monthly token budgets with alerts
- **Trend Analysis** — 7-day trends, week-over-week changes, spike detection
- **Enrichment Modes** — Optional provider quota integration (auto, manual, opencode-quota)
- **Toast Notifications** — Per-response token summary (configurable)
- **Zero Dependencies** — No npm packages; uses only Bun built-ins (fs, path, crypto, fetch, bun:sqlite)
- **SQLite WAL** — Atomic event recording + rollup updates in single transaction
- **Cross-Platform** — Linux, macOS, Windows with automatic data directory detection

## Installation

```bash
npm install oh-my-tokens
```

Add to `opencode.json`:

```json
{
  "plugin": ["oh-my-tokens"]
}
```

## Configuration

Add to `opencode.json` under `experimental`:

```jsonc
{
  "experimental": {
    "oh-my-tokens": {
      // Display mode: "compact" (3 rows) | "normal" (7–10 rows) | "extend" (12–16 rows)
      "display": "normal",

      // Display unit: "tokens" (default) | "cost"
      "unit": "tokens",

      // Enrichment mode: "off" (default) | "auto" | "manual" | "opencode-quota"
      // - off: local tracking only
      // - auto: auto-detect provider quotas via auth.json tokens
      // - manual: user-specified provider budgets
      // - opencode-quota: integrate with opencode-quota plugin
      "enrichment": "off",

      // Toast notifications
      "toast": {
        "enabled": true,
        "durationMs": 9000
      },

      // Token budgets
      "budget": {
        "daily": 500000,
        "weekly": 3000000,
        "monthly": 10000000,
        "timezone": "Asia/Seoul",      // IANA timezone — resets are computed in this zone
        "dailyResetHour": 0,           // Hour (0–23) in the timezone above; default midnight
        "weeklyResetDay": "monday"     // Weekday name (lowercase); default "monday"
      },

      // Cost budgets (optional, requires unit: "cost")
      "costBudget": {
        "daily": 5.00,
        "weekly": 25.00,
        "monthly": 100.00
      },

      // Manual provider budgets (enrichment: "manual" only)
      "providers": {
        "anthropic": { "budget": 500000, "unit": "tokens", "period": "monthly" },
        "openai": { "budget": 1000000, "unit": "tokens", "period": "monthly" }
      },

      // Language: "auto" | "en" | "ko" | "ja" | "zh"
      "lang": "auto",

      // Data retention (days)
      "retention": 90
    }
  },

  // Sidebar widget ordering (0 = top)
  "widget": {
    "oh-my-tokens:usage": { "order": 0 }
  }
}
```

## Sidebar Display Modes

> **Note**: Sidebar display is implemented but currently not rendered — OpenCode does not yet expose a public widget API for plugins. Token data is fully tracked and accessible via `/omt` commands in the meantime.

### Compact (3 rows)
Minimal view for narrow screens or focus mode:
- Reply tokens (think/chat/code breakdown)
- Session total
- Daily budget status

### Normal (7–10 rows)
Default view with provider and agent breakdown:
- Reply tokens
- Session total
- Provider breakdown (anthropic, openai, copilot, etc.)
- Agent breakdown (coder, task, etc.)
- Daily budget + consumption rate

### Extended (12–16 rows)
Detailed view for cost optimization and weekly review:
- All Normal rows
- Token classification (think, chat, code, input, cache)
- Weekly and monthly totals
- Budget status with percentage

## Commands

| Command | Description |
|---------|-------------|
| `/omt` | Today's summary with provider breakdown, token classification, and budget status |
| `/omt agents` | Agent-by-agent breakdown with agent×model cross-analysis |
| `/omt trend` | 7-day trend chart with week-over-week changes and spike detection |
| `/omt budget` | Budget status and remaining capacity |
| `/omt export [json\|csv]` | Export usage data in JSON or CSV format |
| `/omt status` | Diagnostic info (detected providers, database size, pricing data freshness) |
| `/omt rebuild` | Rebuild rollup aggregates from events table |

All command output is non-intrusive (`noReply: true`, `ignored: true`).

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
6. **Display** — Renders sidebar (5-second polling), toast (per response), and commands

**Zero LLM overhead**: Plugin makes no API calls to LLMs, adds no tokens to context window, and uses only local data by default.

## Development

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Commands

```bash
npm install              # Install dependencies
npm run build            # Compile TypeScript
npm run typecheck        # Type check only
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run format           # Format code (Biome)
npm run lint             # Lint code (Biome)
npm run check            # Format + lint (no fixes)
npm run check:ci         # CI lint mode
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

**Questions?** Open an [issue](https://github.com/seungwoo/oh-my-tokens/issues) or check the [docs](https://github.com/seungwoo/oh-my-tokens/wiki).
