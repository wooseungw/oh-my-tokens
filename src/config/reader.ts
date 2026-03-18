import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { BudgetConfig } from "../analytics/budget";
import { findOpencodeConfigPath } from "../paths";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readJsonRecord(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readPluginConfigFromFile(configPath: string): Record<string, unknown> {
  const pluginConfigPath = configPath.endsWith("oh-my-tokens.json")
    ? configPath
    : join(dirname(configPath), "oh-my-tokens.json");
  const pluginConfig = readJsonRecord(pluginConfigPath);

  if (existsSync(pluginConfigPath)) return pluginConfig;

  const root = readJsonRecord(configPath);
  const experimental = root.experimental;
  if (!isRecord(experimental)) return {};

  const rawPluginConfig = experimental["oh-my-tokens"];
  return isRecord(rawPluginConfig) ? rawPluginConfig : {};
}

export function extractBudgetConfig(raw: Record<string, unknown>): BudgetConfig {
  const budgetCfg = raw.budget;
  if (!isRecord(budgetCfg)) return {};

  const parsed: BudgetConfig = {};
  const daily = Number(budgetCfg.daily);
  if (Number.isFinite(daily) && daily > 0) parsed.daily = daily;

  const weekly = Number(budgetCfg.weekly);
  if (Number.isFinite(weekly) && weekly > 0) parsed.weekly = weekly;

  const monthly = Number(budgetCfg.monthly);
  if (Number.isFinite(monthly) && monthly > 0) parsed.monthly = monthly;

  if (typeof budgetCfg.weeklyResetDay === "string") {
    parsed.weeklyResetDay = budgetCfg.weeklyResetDay;
  }

  const resetHour = Number(budgetCfg.dailyResetHour);
  if (Number.isInteger(resetHour) && resetHour >= 0 && resetHour <= 23) {
    parsed.dailyResetHour = resetHour;
  }

  if (typeof budgetCfg.timezone === "string" && budgetCfg.timezone.length > 0) {
    parsed.timezone = budgetCfg.timezone;
  }

  return parsed;
}

export function getRetentionSetting(): number | undefined {
  const cfg = readPluginConfigFromFile(findOpencodeConfigPath());
  const val = Number(cfg.retention);
  return Number.isFinite(val) && val > 0 ? val : undefined;
}

export function getCodeModes(): Set<string> {
  const cfg = readPluginConfigFromFile(findOpencodeConfigPath());
  const modes = cfg.codeModes;
  if (
    Array.isArray(modes) &&
    modes.length > 0 &&
    modes.every((m: unknown) => typeof m === "string")
  ) {
    return new Set(modes as string[]);
  }
  return new Set(["coder", "task"]);
}

export function getUnitSetting(): "tokens" | "cost" {
  const cfg = readPluginConfigFromFile(findOpencodeConfigPath());
  return cfg.unit === "cost" ? "cost" : "tokens";
}

export function getToastConfig(): { enabled: boolean; durationMs: number } {
  const cfg = readPluginConfigFromFile(findOpencodeConfigPath());
  const toast = cfg.toast;
  const enabled = !(
    typeof toast === "object" &&
    toast !== null &&
    (toast as Record<string, unknown>).enabled === false
  );
  const durationMs =
    typeof toast === "object" &&
    toast !== null &&
    typeof (toast as Record<string, unknown>).durationMs === "number"
      ? ((toast as Record<string, unknown>).durationMs as number)
      : 9000;
  return { enabled, durationMs };
}
