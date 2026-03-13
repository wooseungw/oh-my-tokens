# oh-my-token: UX & Budget Improvements

## TL;DR

> **Quick Summary**: Improve `/omt` command output formatting, add budget threshold alerts (command + sidebar), and support configurable reset periods via `opencode.json`.
>
> **Deliverables**:
> - Polished `/omt` output that doesn't look like raw prompt injection
> - Budget warning/error alerts at top of `/omt` output (80%/100% thresholds)
> - Sidebar `status` color consistently reflects budget severity across all display modes
> - `budget.weeklyResetDay` and `budget.dailyResetHour` in `opencode.json` config
> - `opencode.json` budget values (`budget.daily/weekly/monthly`) override env vars
> - All unit tests pass, Biome clean, TSC clean
>
> **Estimated Effort**: Short
> **Parallel Execution**: YES — 2 waves
> **Critical Path**: Task 1 (config) → Task 2 (budget calc) → Task 3 (commands) → Task 4 (sidebar)

---

## Context

### Original Request
Improve oh-my-token plugin: `/omt` output looks like raw prompt injection, add budget threshold alerts to both command output and sidebar, support configurable weekly/daily reset periods in opencode.json.

### Interview Summary
**Key Discussions**:
- UX issue: formatting only — injection mechanism (`injectRawOutput`) stays unchanged
- Alerts: warning at 80%, error at 100% — same threshold everywhere (sidebar + command)
- Reset period: affects **budget calculation only** (not Today/This Week display views)
- Reset config: `opencode.json` style, `opencode.json` overrides env vars (env vars remain as fallback)
- Budget config: `budget.daily/weekly/monthly` also readable from `opencode.json`
- Warning scope: `/omt` default view only (not subcommands)
- Multi-session aggregation: deferred — not confirmed as actual bug

**Research Findings**:
- `src/analytics/budget.ts`: `checkBudget()` and `formatBudgetAlert()` already exist. `formatBudgetAlert()` already filters `ratio >= 0.8`. Just needs connecting to `/omt` default view.
- `src/ui/sidebar.ts`: `getBudgetStatus()` already exists (returns error/warning/success). But thresholds differ (80%=error, 60%=warning) — needs alignment to 80%=warning, 100%=error.
- `src/ui/commands.ts`: `getDailyBudget()` / `getPeriodBudget()` read only from env vars. Need to also read from config.
- `src/storage/rollup.ts`: `weekBounds()` hardcodes Monday start. `getWeekTotal()` and `getTodayRollups()` use calendar bounds. Reset period affects budget-only queries, not these calendar views.
- `src/index.ts`: config hook extracts `providers` and `enrichment` from `opencode.json` — needs to also extract `budget` config.

### Metis Review
**Identified Gaps** (addressed):
- Reset period scope: confirmed budget-only, not all display views
- Threshold alignment: decided warning=80%, error=100% everywhere
- Config precedence: `opencode.json` wins over env vars (backward-compatible)
- Warning scope: `/omt` default only
- Invalid config values: silently ignored (no plugin failure)
- Custom reset windows vs rollup: safe because reset only affects budget queries, not rollup tables

---

## Work Objectives

### Core Objective
Polish `/omt` command output readability, add consistent budget alerting across command and sidebar, and allow budget periods to be configured via `opencode.json`.

### Concrete Deliverables
- `src/analytics/budget.ts` — `BudgetConfig` extended with optional `weeklyResetDay` and `dailyResetHour`; `checkBudget()` uses custom reset bounds when provided
- `src/index.ts` — config hook extracts `budget` object from `opencode.json` and stores it; budget config module updated
- `src/ui/commands.ts` — `/omt` default view prepends alert section when threshold met; output formatting polished
- `src/ui/sidebar.ts` — `getBudgetStatus()` thresholds aligned: warning=80%, error=100%
- Unit tests for new logic in `tests/unit/budget.test.ts`

### Definition of Done
- [ ] `bunx biome check src/` passes with no issues
- [ ] `bunx tsc --noEmit` passes
- [ ] `bunx vitest run tests/unit/` — all tests pass (≥ 94)
- [ ] `/omt` output has clear header, no "raw dump" appearance
- [ ] `/omt` output prepends budget alert when daily usage ≥ 80% of configured limit
- [ ] Sidebar "Today" item shows `status: "warning"` at 80% and `status: "error"` at 100%
- [ ] `opencode.json` with `budget.daily: 500000` is respected; env var fallback still works
- [ ] `budget.weeklyResetDay: "monday"` changes what counts as "this week" in budget check

### Must Have
- Config precedence: `opencode.json > env var` for all budget values
- Thresholds consistent: warning ≥ 80%, error ≥ 100% in both command and sidebar
- Backward compatibility: existing env var users unaffected
- No new npm dependencies

### Must NOT Have (Guardrails)
- Do NOT change `injectRawOutput` mechanism or add new transport channels
- Do NOT apply budget alerts to subcommand outputs (`/omt agents`, `/omt trend`, etc.)
- Do NOT change `getWeekTotal()` / `getTodayRollups()` calendar logic — only budget period queries
- Do NOT add toast notifications for budget alerts
- Do NOT add cost-budget support (tokens only in this plan)
- Do NOT add config validation UI or error output for invalid config values — silently ignore
- Do NOT add multi-session aggregation fixes (deferred)
- Do NOT rewrite `sidebar.ts` display logic beyond threshold alignment

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (existing tests must still pass; new tests for new logic)
- **Framework**: vitest

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved to `.sisyphus/evidence/task-{N}-{slug}.txt`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation, can run in parallel):
├── Task 1: Config extraction + budget config module [quick]
└── Task 2: Budget threshold alignment (sidebar) [quick]

Wave 2 (After Wave 1 — command output improvements):
├── Task 3: /omt output format + alert injection [quick]
└── Task 4: Budget reset period logic [unspecified-low]

Wave FINAL (After ALL tasks):
├── Task F1: Full test suite + lint + type check [quick]
└── Task F2: Scope fidelity check [quick]
```

### Dependency Matrix
- **Task 1**: no deps → blocks Task 3, Task 4
- **Task 2**: no deps → blocks F1
- **Task 3**: depends Task 1 → blocks F1
- **Task 4**: depends Task 1 → blocks F1
- **F1, F2**: depend on all Tasks 1-4

### Agent Dispatch Summary
- Wave 1: 2 agents parallel (`quick`)
- Wave 2: 2 agents parallel (`quick`, `unspecified-low`)
- Wave FINAL: 2 agents parallel

---

## TODOs

 [x] 1. Extract budget config from `opencode.json` and centralize config storage

  **What to do**:
  - In `src/index.ts`: in the `config` hook, extract `pluginCfg?.budget` as `Record<string, unknown>` and parse `daily`, `weekly`, `monthly` (numbers), `weeklyResetDay` (string), `dailyResetHour` (number)
  - Create a module-level config store: `let _budgetConfig: BudgetConfig = {}` in `src/index.ts` (alongside existing `_enrichmentConfig`)
  - Export a getter: `getBudgetConfig(): BudgetConfig` from a shared location — either add to `src/analytics/budget.ts` or create `src/analytics/budget-config.ts`
  - Update `BudgetConfig` interface in `src/analytics/budget.ts` to add: `weeklyResetDay?: string` (values: "monday"–"sunday", case-insensitive), `dailyResetHour?: number` (0–23, integers only)
  - Config precedence: `opencode.json` values win over env vars. In `commands.ts`'s `getPeriodBudget()` / `getDailyBudget()`, check config store first, then fall back to env var
  - Invalid `weeklyResetDay` strings (not a weekday name) → silently ignored, use default Monday
  - Invalid `dailyResetHour` (out of range 0–23, non-integer, NaN) → silently ignored, use default 0 (midnight)

  **Must NOT do**:
  - Do NOT add validation error output or plugin init failure on bad config
  - Do NOT touch enrichment or provider config extraction

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 2-3 file changes, no complex logic, pure config plumbing
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/index.ts:99-111` — existing config hook; `_enrichmentConfig` pattern to follow for `_budgetConfig`
  - `src/index.ts:3-6` — existing imports pattern

  **API/Type References**:
  - `src/analytics/budget.ts:8-12` — `BudgetConfig` interface to extend
  - `src/analytics/budget.ts:46` — `checkBudget(config: BudgetConfig)` signature — the getter must supply this
  - `src/ui/commands.ts:78-98` — `getDailyBudget()` / `getPeriodBudget()` — update to check config first

  **Test References**:
  - `tests/unit/budget.test.ts` — existing budget tests; add config-parsing tests here

  **Acceptance Criteria**:
  - [ ] `BudgetConfig` has `weeklyResetDay?: string` and `dailyResetHour?: number`
  - [ ] `getBudgetConfig()` or equivalent is accessible from `commands.ts` and `budget.ts`
  - [ ] In `config` hook, `pluginCfg.budget.daily` sets `_budgetConfig.daily`
  - [ ] `getPeriodBudget("daily")` returns `opencode.json` value if set, env var if not

  **QA Scenarios**:

  ```
  Scenario: opencode.json budget config is parsed and accessible
    Tool: Bash (bun test)
    Steps:
      1. Add test in tests/unit/budget.test.ts that sets _budgetConfig via config hook mock
      2. Assert getPeriodBudget("daily") returns opencode.json value
      3. Assert env var fallback works when opencode.json value absent
      4. Assert invalid weeklyResetDay "funday" is silently ignored
    Expected Result: All new assertions pass
    Evidence: .sisyphus/evidence/task-1-config-parse.txt (bunx vitest run output)
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `feat(config): extract budget config from opencode.json with env var fallback`
  - Files: `src/analytics/budget.ts`, `src/index.ts`, `src/ui/commands.ts`, `tests/unit/budget.test.ts`

---

 [x] 2. Align sidebar budget thresholds to warning=80%, error=100%

  **What to do**:
  - In `src/ui/sidebar.ts`: update `getBudgetStatus(ratio)` thresholds:
    - Current: `ratio >= 0.8` → `"error"`, `ratio >= 0.6` → `"warning"`, else `"success"`
    - Target: `ratio >= 1.0` → `"error"`, `ratio >= 0.8` → `"warning"`, else `"success"`
  - No other changes to sidebar logic

  **Must NOT do**:
  - Do NOT change any sidebar item labels, values, or display logic beyond this threshold change
  - Do NOT add new sidebar items

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: single function, 2-line change
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/ui/sidebar.ts:95-109` — `getBudgetStatus()` function to update

  **Acceptance Criteria**:
  - [ ] `getBudgetStatus(0.79)` returns `"success"`
  - [ ] `getBudgetStatus(0.80)` returns `"warning"`
  - [ ] `getBudgetStatus(0.99)` returns `"warning"`
  - [ ] `getBudgetStatus(1.00)` returns `"error"`
  - [ ] `getBudgetStatus(1.10)` returns `"error"`

  **QA Scenarios**:

  ```
  Scenario: Sidebar budget status colors follow new thresholds
    Tool: Bash (bun test)
    Steps:
      1. Add unit test in tests/unit/budget.test.ts (or sidebar test) checking getBudgetStatus at boundary values
      2. Run bunx vitest run tests/unit/
    Expected Result: All pass; getBudgetStatus boundary values match spec
    Evidence: .sisyphus/evidence/task-2-sidebar-thresholds.txt
  ```

  **Commit**: YES (groups with Task 1)
  - Message: `feat(config): extract budget config from opencode.json with env var fallback`
  - Files: `src/ui/sidebar.ts`, `tests/unit/budget.test.ts`

---

- [ ] 3. Polish `/omt` default output format + inject budget alert when threshold met

  **What to do**:
  - In `src/ui/commands.ts`, update `buildTodaySummary()`:
    - Add a visual header line at the top: `"oh-my-tokens  ·  Today's Summary"` or similar clean format
    - Replace bare `═══` section rules with labeled sections (e.g. `── Providers ─────────────────────`)
    - Make the overall output feel like a structured report, not a raw text dump
    - Prepend the budget alert section **at the top** when `formatBudgetAlert()` returns non-null:
      - Get budget config (from Task 1's getter)
      - Call `checkBudget(budgetConfig)` to get statuses
      - Call `formatBudgetAlert(statuses)` — if non-null, prepend to output with a blank line separator
  - Do NOT touch `buildAgentSummary`, `buildTrendSummary`, `buildBudgetSummary`, `buildLimitsSummary`, `buildExportOutput`, `buildStatusOutput`
  - Keep `SECTION_RULE` constant or rename — just used in `buildTodaySummary` now
  - `formatBudgetAlert()` already exists in `src/analytics/budget.ts:101` — use it directly
  - Threshold is already correct in `formatBudgetAlert()` (filters `ratio >= 0.8`)

  **Must NOT do**:
  - Do NOT change any subcommand output builders (agents, trend, budget, limits, status, export)
  - Do NOT change the `injectRawOutput` mechanism
  - Do NOT add toast notifications
  - Do NOT add cost display (tokens only)
  - Cognitive complexity must stay ≤ 15 for any function

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: formatting changes in one function + budget alert wiring
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/ui/commands.ts:135-165` — `buildTodaySummary()` function to update
  - `src/ui/commands.ts:17` — `SECTION_RULE` constant
  - `src/analytics/budget.ts:101-119` — `formatBudgetAlert()` to call

  **API/Type References**:
  - `src/analytics/budget.ts:46` — `checkBudget(config)` call signature
  - Task 1's `getBudgetConfig()` getter — use to get the merged config

  **Acceptance Criteria**:
  - [ ] `/omt` output has a clean formatted header (not a raw text block)
  - [ ] When daily budget ≥ 80%: output starts with budget alert section, then summary
  - [ ] When daily budget < 80%: no alert section, just summary
  - [ ] `buildTodaySummary` passes Biome cognitive complexity check (≤ 15)

  **QA Scenarios**:

  ```
  Scenario: /omt output format is clean (no budget alert)
    Tool: Bash (bun -e inline test)
    Steps:
      1. Import buildTodaySummary (or handleOmtCommand) with zero-usage mock data
      2. Assert output contains a formatted header line
      3. Assert output does NOT contain a budget alert section
      4. Assert output is valid UTF-8 multiline text with labeled sections
    Expected Result: Output matches expected format, no alert block
    Evidence: .sisyphus/evidence/task-3-format-clean.txt

  Scenario: /omt output prepends budget alert when 80%+ usage
    Tool: Bash (bun -e inline test or vitest)
    Steps:
      1. Set daily budget = 100 tokens in config mock
      2. Mock rollup data to return 85 tokens used
      3. Call handleOmtCommand("", sessionID)
      4. Assert result.text starts with "oh-my-tokens — Budget" alert block
      5. Assert main summary follows after alert
    Expected Result: Alert block at top, summary below
    Evidence: .sisyphus/evidence/task-3-format-alert.txt
  ```

  **Commit**: YES (separate)
  - Message: `feat(commands): polish /omt output format and add budget alert header`
  - Files: `src/ui/commands.ts`
  - Pre-commit: `bunx biome check src/ui/commands.ts`

---

- [ ] 4. Budget reset period logic (`weeklyResetDay`, `dailyResetHour`)

  **What to do**:
  - In `src/analytics/budget.ts`, update `checkBudget()` to use custom reset windows from `BudgetConfig`:
    - **`dailyResetHour`**: Instead of `getTodayRollups()` (which uses calendar date), query rollups in a time range: `[today at resetHour, now]`. If `dailyResetHour === 0` (or undefined), behavior is identical to current (midnight reset).
    - **`weeklyResetDay`**: Instead of `getWeekTotal()` (which uses Monday-start ISO week), compute a custom 7-day window starting from the most recent occurrence of `weeklyResetDay` at `dailyResetHour` (or midnight). If `weeklyResetDay === "monday"` (or undefined), behavior is identical to current.
  - Add helper `parseWeekdayIndex(day: string): number` (0=Sunday…6=Saturday); returns -1 if invalid → caller falls back to current logic
  - Add helper `customDailyWindow(resetHour: number): { from: Date; to: Date }` — from = today at resetHour, to = now
  - Add helper `customWeeklyWindow(resetDay: string, resetHour: number): { from: Date; to: Date }` — from = most recent `resetDay` at `resetHour`, to = now
  - Budget queries using custom windows must use direct DB queries via `queryAll` for rollup rows in date range — pattern: `getMonthProviderRollups()` in `src/storage/rollup.ts:163` for reference on date-range queries
  - If `dailyResetHour` is undefined/default (0) AND `weeklyResetDay` is undefined/default ("monday"): use existing `getTodayRollups()` and `getWeekTotal()` (no behavioral change)
  - Monthly budget: always uses calendar month (no custom reset for monthly)

  **Must NOT do**:
  - Do NOT modify `getTodayRollups()`, `getWeekTotal()`, or any other rollup query functions — add new helpers or inline in `checkBudget()`
  - Do NOT change the rollup DB schema
  - Do NOT apply reset logic to `buildTodaySummary` Today/This Week display

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: date math logic with edge cases (DST, week boundary), needs careful implementation
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: F1
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/storage/rollup.ts:41-53` — `weekBounds()` pattern for computing week start/end dates
  - `src/storage/rollup.ts:163` — `getMonthProviderRollups()` for date-range query pattern
  - `src/analytics/budget.ts:46-99` — `checkBudget()` to update

  **API/Type References**:
  - `src/storage/rollup.ts:4-17` — `RollupRow` interface
  - `src/storage/db.ts` — `queryAll`, `queryOne` import pattern

  **Test References**:
  - `tests/unit/budget.test.ts` — add reset period boundary tests here

  **Acceptance Criteria**:
  - [ ] `checkBudget({ daily: 1000, dailyResetHour: 6 })` computes daily usage from 6am today to now
  - [ ] `checkBudget({ weekly: 10000, weeklyResetDay: "wednesday" })` computes weekly usage from last Wednesday midnight to now
  - [ ] `weeklyResetDay: "funday"` silently falls back to Monday behavior
  - [ ] `dailyResetHour: 25` silently falls back to midnight behavior
  - [ ] Default behavior (no custom reset) is identical to before — existing tests still pass
  - [ ] All new helpers have cognitive complexity ≤ 15

  **QA Scenarios**:

  ```
  Scenario: Custom dailyResetHour correctly bounds daily budget query
    Tool: Bash (vitest)
    Steps:
      1. In test, mock rollup data spanning yesterday + today
      2. Set dailyResetHour = 10 (10am)
      3. Call checkBudget with daily limit
      4. Assert only tokens since 10am today are counted
    Expected Result: used = tokens after 10am, not full calendar day
    Evidence: .sisyphus/evidence/task-4-reset-hour.txt

  Scenario: Invalid weeklyResetDay falls back silently
    Tool: Bash (vitest)
    Steps:
      1. Set weeklyResetDay = "funday"
      2. Call checkBudget
      3. Assert no error thrown, result matches Monday-week behavior
    Expected Result: No exception, Monday week used as fallback
    Evidence: .sisyphus/evidence/task-4-reset-invalid.txt
  ```

  **Commit**: YES (separate)
  - Message: `feat(budget): support weeklyResetDay and dailyResetHour config`
  - Files: `src/analytics/budget.ts`, `tests/unit/budget.test.ts`
  - Pre-commit: `bunx biome check src/analytics/budget.ts`

---

## Final Verification Wave

- [ ] F1. **Full Suite Verification** — `quick`
  Run `bunx biome check src/`, `bunx tsc --noEmit`, `bunx vitest run tests/unit/`. Assert: 0 Biome issues, 0 type errors, all tests pass (≥ 94 tests). If any fail, fix and rerun before marking complete.
  Output: `Biome [PASS/FAIL] | TSC [PASS/FAIL] | Tests [N pass/fail] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Scope Fidelity Check** — `quick`
  Read each task's "What to do" and "Must NOT do". Review git diff. Verify: (1) subcommand outputs unchanged, (2) `injectRawOutput` mechanism unchanged, (3) rollup query functions unchanged, (4) no new npm deps added, (5) no toast notifications added.
  Output: `Tasks [N/N compliant] | Guardrails [CLEAN/issues] | VERDICT: APPROVE/REJECT`

---

## Commit Strategy

- **Commit A** (Tasks 1+2): `feat(config): extract budget config from opencode.json with env var fallback`
- **Commit B** (Task 3): `feat(commands): polish /omt output format and add budget alert header`
- **Commit C** (Task 4): `feat(budget): support weeklyResetDay and dailyResetHour config`

---

## Success Criteria

### Verification Commands
```bash
bunx biome check src/          # Expected: Checked N files. No fixes applied.
bunx tsc --noEmit              # Expected: (no output = success)
bunx vitest run tests/unit/    # Expected: N passed (0 failed)
```

### Final Checklist
- [ ] All "Must Have" present: config precedence, consistent thresholds, backward compat, zero new deps
- [ ] All "Must NOT Have" absent: no subcommand alert injection, no transport change, no toast, no cost display
- [ ] All 94+ tests pass
- [ ] Biome and TSC clean
