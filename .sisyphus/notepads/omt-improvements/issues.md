# Issues — omt-improvements

## 2026-03-13 — Pre-execution analysis

### [CRITICAL] Task 4: dailyResetHour requires events table query, NOT rollup query

**Finding**: Rollup rows are DATE-granular (one row per provider/agent per date). There is NO time column. A custom `dailyResetHour` (e.g., 6am) cannot be computed from rollup rows because there's no way to filter rollup rows by hour-of-day.

**Correct approach for dailyResetHour**:
- Query `events` table directly: `SELECT SUM(inp + out + think + cache_r + cache_w) FROM events WHERE ts >= todayAtResetHour`
- `ts` is Unix millisecond timestamp
- Pattern: see `getHourProviderTotals()` in `src/storage/rollup.ts:284` for the events-table query pattern

**Correct approach for weeklyResetDay**:
- Can use rollup table with date range: `getRollups(from, today)` where `from = most recent weekday`
- Rollup rows by date are sufficient since weekly resets are per-day granular

**Impact on Task 4 implementation**:
- If `dailyResetHour !== undefined && dailyResetHour !== 0`: query events WHERE ts >= today-at-resetHour
- If `weeklyResetDay` not undefined/monday: compute date string `from`, call `getRollups(from, todayDateKey())`, sum totals
- Default (no custom config OR dailyResetHour=0 AND weeklyResetDay=monday): use existing getTodayRollups()/getWeekTotal() unchanged

### [INFO] getRollups() already exists
`src/storage/rollup.ts:104` exports `getRollups(from: string, to: string): RollupRow[]`
This is perfect for the weeklyResetDay use case.

### [INFO] events table query for daily
```sql
SELECT SUM(inp + out + think + cache_r + cache_w) AS tokens
FROM events
WHERE ts >= ?
```
Pass Unix ms timestamp of today-at-resetHour. This is equivalent to what `getHourProviderTotals()` does.
