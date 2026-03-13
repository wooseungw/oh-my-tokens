# Commands

All commands are invoked as `/omt [subcommand]` inside OpenCode. Output is non-intrusive — it does not create a new assistant reply or add tokens to the context window.

---

## /omt

Today's summary. The primary view for checking current usage and limits.

**Sections:**

1. **Per-provider quota blocks** — shown only for providers with live quota data. Header includes today's token count. Rows show time-window quota bars from the live API (`[live]`).
2. **Today distribution** — all providers sorted by today's token usage. Bar shows each provider's share of the day's total.
3. **Breakdown** — token type split: think, chat, code, input, cache.
4. **Budget** — only shown if a budget is configured. Includes a pacing line showing allowed tokens/hour for the rest of the day.

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
  🧠 think       0 ( 0%)   💬 chat  37.2K ( 1%)
  ⌨️ code        0 ( 0%)   📥 input    95 ( 0%)
  📦 cache   13.1M (99%)   Σ total  13.2M
─── Budget ──────────────────────────────
  daily    ████░░░░░░░░░░░░   28%    13.2M /    50.0M  ✓
  pace     3.1M tok/h allowed  ·  9.8 req/h  (47 req today)
```

---

## /omt agents

Agent-by-agent token breakdown for today. Labels are right-padded to the longest name so bars align.

```
oh-my-tokens — Agent Usage
═══════════════════════════════════════
AGENTS
  Sisyphus (Ultraworker) ×188  ████████████████  97%   19.5M tok
  compaction ×2                ░░░░░░░░░░░░░░░░   2%  311.4K tok
  explore ×13                  ░░░░░░░░░░░░░░░░   1%  239.8K tok
═══════════════════════════════════════
```

---

## /omt trend

7-day daily usage chart with week-over-week comparison and spike detection.

```
oh-my-tokens — 7-Day Trend
═══════════════════════════════════════
DAILY USAGE
Mar 08  ████████░░░░░░░░░░░░  120.0K
Mar 09  ████████████░░░░░░░░  184.0K
Mar 10  ██████████░░░░░░░░░░  150.0K
Mar 11  ████████████████████  320.0K  ← spike
Mar 12  ██████████░░░░░░░░░░  155.0K
Mar 13  ████████████░░░░░░░░  190.0K
Mar 14  █████████████░░░░░░░  210.0K
═══════════════════════════════════════
WoW  +12.3% (this week vs last week)
⚠️ Spike: 2026-03-11 (Z=2.4)
```

---

## /omt budget

Shows all configured budget periods with progress bars. Only shows configured periods.

```
oh-my-tokens — Budget Status
═══════════════════════════════════════
  daily    ████████░░░░░░░░   50.0%     300K /     500K ~
  weekly   ████░░░░░░░░░░░░   25.0%     1.2M /     5.0M ✓
  monthly  ██░░░░░░░░░░░░░░   10.0%     4.5M /    45.0M ✓
═══════════════════════════════════════
```

---

## /omt limits

Detailed per-provider view of all quota windows — both live API windows and locally configured limits. Use this for a full picture of rate limits across all time horizons.

```
oh-my-tokens — Provider Limits  [Mar 2026]
═══════════════════════════════════════
ANTHROPIC  (Claude Max 5)  [live]
  ⏱ 5-hour   ████████░░░░░░░░   52%  [live]
  🗓 7-day    ████░░░░░░░░░░░░   28%  [live]
  📅 today    ████████████████  100%    52.0M /    52.0M ⚠️
  📆 weekly   ████████░░░░░░░░   52%   520.0M /  1000.0M

OPENAI  [live]
  ⏱ hourly    ████████████░░░░   75%  [live]    1.5M /    2.0M
  📆 weekly   ████░░░░░░░░░░░░   30%  [live]
═══════════════════════════════════════
```

---

## /omt export [json|csv]

Exports today's usage data from the SQLite database.

- `/omt export` — JSON (default)
- `/omt export csv` — CSV

JSON output includes `providers`, `agents`, and `totals` objects. CSV includes one row per rollup entry (provider and agent rows).

---

## /omt status

Plugin diagnostics.

```
oh-my-tokens — Status
═══════════════════════════════════════
Version      0.1.14
Schema       v3
Events       52,847
Rollup rows  1,203
Providers    anthropic, copilot, google
Session      ses_abc123
Retention    90 days
═══════════════════════════════════════
```

---

## /omt rebuild

Drops and rebuilds all rollup aggregates from the raw events table. Safe to run at any time — raw events are never deleted by this command.

Use when `/omt` totals look wrong or after manually modifying the database.

---

## /omt setting

View or update any plugin config key without editing `opencode.json` manually.

```
/omt setting                              show all current settings
/omt setting display compact              set display mode
/omt setting budget.daily 500000          set daily token budget
/omt setting budget.timezone Asia/Seoul   set reset timezone
/omt setting budget.dailyResetHour 9      set daily reset hour
/omt setting toast.enabled false          disable toast
```

Changes are written to `opencode.json`. **Restart OpenCode to apply.**
