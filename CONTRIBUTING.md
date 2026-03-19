# Contributing to oh-my-tokens

Thank you for your interest in contributing to oh-my-tokens! This guide will help you get started.

## Prerequisites

- **Node.js >= 18.0.0** (for development, testing, and CI)
- **npm >= 9.0.0** (for package management)

The plugin runs on Bun in OpenCode, but development uses Node.js for compatibility.

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/wooseungw/oh-my-tokens.git
   cd oh-my-tokens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

## Development Commands

- **`npm run check`** — Run Biome format + lint checks (no modifications)
- **`npm run typecheck`** — Type-check with TypeScript
- **`npm test`** — Run tests with vitest
- **`npm run build`** — Compile TypeScript to JavaScript

## Code Style

- **Formatting & Linting**: Biome handles both. Run `npm run check` before committing.
- **No `any` types**: Biome enforces `noExplicitAny: "error"`. Use proper types instead.
- **Conventional Commits**: Use the format `<type>(<scope>): <description>`
  - `feat(sidebar): add extended display mode`
  - `fix(recorder): handle missing reasoning tokens`
  - `test(classifier): add edge case for empty toolCalls`

## Pull Request Process

1. **Create a feature branch** from `main`
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** and commit with conventional commit messages

3. **Run quality checks locally**
   ```bash
   npm run check      # Biome format + lint
   npm run typecheck  # Type checking
   npm test           # Tests
   npm run build      # Build
   ```

4. **Push and create a PR** with a clear description

5. **Use the PR template** (`.github/pull_request_template.md`) to ensure all checks are covered

## Testing

- Tests use **vitest** and are located in `tests/`
- **bun:sqlite** is mocked in tests since Node.js doesn't have it natively
- Add tests for any new behavior or bug fixes
- Aim for high coverage on core modules (classifier, normalizer, recorder, formatter, budget)

## Git Hooks

Pre-commit hooks (via Husky) automatically run:
1. Biome format + lint on changed files
2. TypeScript type checking
3. Test suite

If any check fails, the commit is blocked. Fix the issues and try again.

## Questions?

- Check existing issues and discussions
- Review the [INFRA.md](./INFRA.md) for detailed infrastructure documentation
- Open an issue with the "question" label if needed

## Source Architecture

The `src/` directory is organized by concern. Each module has a single responsibility.

```
src/
├── index.ts              — Plugin entry point (OhMyTokensPlugin, getSidebarItems export)
├── pipeline.ts           — OpenCode hook handlers (message.updated, session.idle, compacted)
├── paths.ts              — Data directory path resolution (OS-specific XDG/AppData)
├── utils.ts              — Date formatting utilities
│
├── analytics/
│   ├── aggregator.ts     — Converts rollup rows to AggregatedUsage objects
│   ├── budget.ts         — Budget config and checking (setBudgetConfig, checkBudget)
│   ├── plans.ts          — Provider plan definitions and per-provider limit management
│   ├── pricing.ts        — Token cost pricing table and cost calculation
│   ├── quota.ts          — Live quota state management (setLiveQuotas, getLiveQuota)
│   ├── token-math.ts     — Shared computeTotalTokens helper and TokenRow interface
│   └── trends.ts         — 7-day trend analysis
│
├── config/
│   └── reader.ts         — Pure config reading: readPluginConfigFromFile, extractBudgetConfig
│
├── enrichment/
│   ├── auth.ts           — Auth credential helpers: readAuthToken, readAuthJson, getAuthJsonCandidatePaths
│   ├── auth-watcher.ts   — Watches auth.json for new providers (initKnownAuthProviders, setupAuthWatcher)
│   ├── cache.ts          — Generic TTL cache for enrichment data (5-min TTL)
│   ├── fetch-utils.ts    — safeFetch, isRecord, readFiniteNumber, parseUsageBody
│   ├── providers.ts      — ENRICHMENT_PROVIDERS registry and ProviderQuota interfaces
│   └── resolver.ts       — Enrichment mode resolution and provider auto-detection
│
├── storage/
│   ├── backfill.ts       — Rebuilds rollups from raw events on first install
│   ├── db.ts             — SQLite initialization, execute/query helpers
│   ├── migrations.ts     — Schema migration runner
│   ├── rollup.ts         — Rollup aggregation queries (SUM_TOKEN_COLUMNS constant)
│   └── sessions.ts       — Session tracking and session ancestry graph
│
├── tracking/
│   ├── attribution.ts    — Resolves agent and initiator from session ancestry
│   ├── classifier.ts     — Token type classification (think / chat / code)
│   ├── config-hash.ts    — Config change detection for budget re-evaluation
│   ├── normalizer.ts     — Normalizes raw OpenCode events to token counts
│   └── recorder.ts       — Records events to SQLite (upsertEvent, upsertRollup)
│
└── ui/
    ├── commands/
    │   ├── index.ts      — handleOmtCommand router (single export entry point for all /omt subcommands)
    │   ├── agents.ts     — buildAgentSummary (/omt agents)
    │   ├── budget-cmd.ts — buildBudgetSummary (/omt budget)
    │   ├── limits.ts     — buildLimitsSummary (/omt limits)
    │   ├── misc.ts       — buildStatusOutput, buildExportOutput, handleOmtRebuild
    │   ├── setting.ts    — SETTING_SPECS, applyOhMyTokensSetting, buildSettingCommandOutput
    │   ├── today.ts      — buildTodaySummary, getDailyBudget, getPeriodBudget (/omt default)
    │   └── trend.ts      — buildTrendSummary (/omt trend)
    ├── formatter.ts      — formatTokens (human-readable token count formatting)
    ├── render.ts         — Shared render primitives: buildBar, formatUsageLine, SECTION_RULE
    ├── sidebar.ts        — getSidebarItems (sidebar panel)
    └── toast.ts          — Toast notification rendering
```

**Key invariants to keep in mind when contributing:**
- `src/analytics/aggregator.ts` has `AggregatedUsage.totalTokens` as a **field** (not a function). Do not confuse with `computeTotalTokens()` in `token-math.ts`.
- `handleOmtCommand` signature is fixed: `(args: string, sessionID: string, applyConfig?: () => void) => { text: string }`
- `applyOhMyTokensSetting` returns `{ ok: boolean, error?: string }` — not `{ success }`
- Zero runtime npm dependencies — `dependencies: {}` in `package.json` must stay empty

## Documentation Policy

**Every code change that affects user-facing behavior or internal architecture must include a documentation update in the same PR.**

### What requires a docs update

| Change type | What to update |
|-------------|----------------|
| New or changed `/omt` command | `docs/commands.md` |
| New or changed config key | `docs/configuration.md` |
| New or changed provider support | `docs/providers.md` |
| New source file or module | `CONTRIBUTING.md` — Source Architecture section |
| Deleted or renamed source file/module | `CONTRIBUTING.md` — Source Architecture section |
| User-facing behavior change | `README.md` |
| New invariant or constraint | `CONTRIBUTING.md` — Key invariants section |

### What does NOT require a docs update
- Internal refactoring with no external behavior change
- Test additions
- Dependency version bumps (Dependabot)
- CI/infra changes (update `INFRA.md` if needed, not these docs)

### PR checklist
The `.github/pull_request_template.md` contains documentation checkboxes. Reviewers **must** verify these before approving.

Happy coding! 🚀
