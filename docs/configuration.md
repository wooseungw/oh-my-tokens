# Configuration

You can customize the oh-my-tokens plugin behavior by editing `oh-my-tokens.json` — the plugin's dedicated config file, created automatically next to your `opencode.json`. The recommended way to modify these settings is using the `/omt setting` command.

## Settings Reference

| Key | Type | Default | Description |
|---|---|---|---|
| enrichment | string | "auto" | Controls how live quota data is fetched. Options: `off`, `auto` (default), `manual` (uses your own limits), `opencode-quota`. |
| display | string | "normal" | Sidebar display mode (reserved for future use). Options: `compact`, `normal`, `extend`. |
| unit | string | "tokens" | Display units for usage. Options: `tokens`, `cost`. |
| lang | string | "auto" | Language for the output. Options: `auto`, `en`, `ko`, `ja`, `zh`. |
| retention | number | 90 | How many days to keep usage events in the SQLite database before they are pruned. |
| budget.daily | number | 0 | Your daily token budget. Setting this enables pacing and budget progress bars in `/omt`. |
| budget.weekly | number | 0 | Your weekly token budget. |
| budget.monthly | number | 0 | Your monthly token budget. |
| budget.timezone | string | "UTC" | IANA timezone string for budget reset calculations (e.g., `Asia/Seoul`). |
| budget.dailyResetHour | number | 0 | The hour of the day (0–23) when the daily budget resets in your configured timezone. |
| budget.weeklyResetDay | string | "monday" | The day of the week (`monday`–`sunday`) when the weekly budget resets. |
| toast.enabled | boolean | true | Enables or disables the per-response token usage toast notifications. |
| toast.durationMs | number | 9000 | The duration (in milliseconds) for which the usage toast remains visible. |
| providers | object | {} | Manual limits for specific providers when `enrichment` is set to `manual`. |

## Examples

### Set a Daily Budget and Timezone
To set a daily budget of 500,000 tokens and ensure it resets correctly for your local time, run:
```bash
/omt setting budget.daily 500000
/omt setting budget.timezone "Asia/Seoul"
/omt setting budget.dailyResetHour 0
```

### Configure Manual Provider Limits
To use manual provider limits, set `enrichment` to `manual` in `oh-my-tokens.json`, then add your provider budgets:
```json
{
  "enrichment": "manual",
  "providers": {
    "anthropic": {
      "budget": 500000,
      "unit": "tokens",
      "period": "monthly"
    }
  }
}
```

### Disable Toast Notifications
If you find the usage toasts distracting, you can disable them entirely:
```bash
/omt setting toast.enabled false
```
