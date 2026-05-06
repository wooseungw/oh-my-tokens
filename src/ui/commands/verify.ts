import type { VerificationReport } from "../../verification/runner";

function formatUsd(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toFixed(6)}`;
}

export function formatVerificationReport(report: VerificationReport): string {
  if (report.items.length === 0) {
    return "no verification items (verify mode may be 'off' for all providers, or no records matched the sampling window)";
  }

  const header =
    "provider           | status   | recorded     | actual       | delta        | reason";
  const divider =
    "-------------------+----------+--------------+--------------+--------------+-----------------------";
  const rows = report.items.map((item) => {
    const provider = item.provider.padEnd(18).slice(0, 18);
    const status = item.result.status.padEnd(8).slice(0, 8);
    const recorded = formatUsd(item.result.expected).padStart(12);
    const actual = formatUsd(item.result.actual).padStart(12);
    const delta = formatUsd(item.result.delta).padStart(12);
    const reason = item.result.reason ?? "";
    return `${provider} | ${status} | ${recorded} | ${actual} | ${delta} | ${reason}`;
  });
  const summary = `\nsummary: ok=${report.summary.ok}  delta=${report.summary.delta}  skipped=${report.summary.skipped}  error=${report.summary.errored}  Σ_expected=${formatUsd(report.summary.totalExpected)}  Σ_actual=${formatUsd(report.summary.totalActual)}`;

  return [header, divider, ...rows, summary].join("\n");
}

export function buildVerifyEmpty(): string {
  return "verification runner: no session records provided.\n\nUsage:\n  /omt verify --session <id>\n  /omt verify --last-day\n\nConfigure per-provider verify mode with:\n  /omt setting providers.openrouter.verify all";
}
