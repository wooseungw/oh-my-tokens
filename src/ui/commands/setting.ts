import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { computeTotalTokens } from "../../analytics/token-math";
import { findOhMyTokensConfigPath, findOpencodeConfigPath } from "../../paths";
import { getTodayRollups, type RollupRow } from "../../storage/rollup";
import { buildSectionDivider, formatUsageLine, SECTION_RULE } from "../render";
import type { DisplayMode } from "../sidebar";

type SettingValue = string | number | boolean;

interface UsageTotals {
  inp: number;
  out: number;
  think: number;
  chat: number;
  code: number;
  cache_r: number;
  cache_w: number;
}

function readOhMyTokensConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readRawPluginConfig(configPath: string): Record<string, unknown> {
  if (!existsSync(configPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const exp = raw.experimental as Record<string, unknown> | undefined;
    return (exp?.["oh-my-tokens"] as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

function getEffectivePluginConfig(): Record<string, unknown> {
  const omtPath = findOhMyTokensConfigPath();
  if (existsSync(omtPath)) {
    return readOhMyTokensConfig(omtPath);
  }
  return readRawPluginConfig(findOpencodeConfigPath());
}

function getDisplayMode(): DisplayMode {
  const cfg = getEffectivePluginConfig();
  const display = cfg.display;
  if (display === "compact" || display === "normal" || display === "extend" || display === "text") {
    return display;
  }
  return "normal";
}

function coerceSettingValue(raw: string): SettingValue {
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(n)) return n;
  return raw;
}

function fmtVal(val: unknown): string {
  if (val === undefined || val === null) return "(not set)";
  return String(val);
}

function buildSettingDisplay(): string {
  const omtPath = findOhMyTokensConfigPath();
  const cfg = existsSync(omtPath)
    ? readOhMyTokensConfig(omtPath)
    : readRawPluginConfig(findOpencodeConfigPath());
  const budget = (cfg.budget as Record<string, unknown>) ?? {};
  const toast = (cfg.toast as Record<string, unknown>) ?? {};
  const KEY_W = 24;
  const VAL_W = 14;
  const row = (key: string, val: unknown, hint: string) => {
    const k = key.padEnd(KEY_W);
    const v = fmtVal(val).padEnd(VAL_W);
    return `  ${k} ${v}  ${hint}`;
  };
  return [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `Config   ${omtPath}`,
    "",
    row("display", cfg.display, "compact | normal | extend | text"),
    row("unit", cfg.unit, "tokens | cost"),
    row("enrichment", cfg.enrichment, "off | auto | manual | opencode-quota"),
    row("lang", cfg.lang, "auto | en | ko | ja | zh"),
    row("retention", cfg.retention, "<number> (days)"),
    buildSectionDivider("Budget"),
    row("budget.daily", budget.daily, "<number> (tokens)"),
    row("budget.weekly", budget.weekly, "<number> (tokens)"),
    row("budget.monthly", budget.monthly, "<number> (tokens)"),
    row("budget.timezone", budget.timezone, "IANA timezone  e.g. Asia/Seoul"),
    row("budget.dailyResetHour", budget.dailyResetHour, "0–23"),
    row("budget.weeklyResetDay", budget.weeklyResetDay, "monday | tuesday | ... | sunday"),
    buildSectionDivider("Toast"),
    row("toast.enabled", toast.enabled, "true | false"),
    row("toast.durationMs", toast.durationMs, "<number> (ms)"),
    "",
    "Set:  /omt setting <key> <value>",
    SECTION_RULE,
  ].join("\n");
}

function readCurrentSettingValue(
  plugin: Record<string, unknown>,
  key: string,
): SettingValue | undefined {
  const dotIdx = key.indexOf(".");
  if (dotIdx !== -1) {
    const parent = plugin[key.slice(0, dotIdx)];
    if (typeof parent === "object" && parent !== null) {
      return (parent as Record<string, unknown>)[key.slice(dotIdx + 1)] as SettingValue;
    }
    return undefined;
  }
  return plugin[key] as SettingValue;
}

function normalizeSettingArgs(
  first: string,
  second: string,
  third: SettingValue | string,
): { configPath: string; key: string; value: SettingValue } {
  if (first.endsWith(".json") || first.includes("/") || first.includes("\\")) {
    return { configPath: first, key: second, value: third as SettingValue };
  }
  return { configPath: String(third), key: first, value: second as SettingValue };
}

export function applyOhMyTokensSetting(
  first: string,
  second: string,
  third: SettingValue | string,
): { ok: boolean; oldValue?: SettingValue; error?: string } {
  const { configPath, key, value } = normalizeSettingArgs(first, second, third);
  let cfg: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      cfg = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
      return { ok: false, error: "Could not parse oh-my-tokens.json" };
    }
  }
  const oldValue = readCurrentSettingValue(cfg, key);
  const dotIdx = key.indexOf(".");
  if (dotIdx !== -1) {
    const parentKey = key.slice(0, dotIdx);
    const childKey = key.slice(dotIdx + 1);
    if (typeof cfg[parentKey] !== "object" || cfg[parentKey] === null) {
      cfg[parentKey] = {};
    }
    (cfg[parentKey] as Record<string, unknown>)[childKey] = value;
  } else {
    cfg[key] = value;
  }
  try {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
    return { ok: true, oldValue };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export type SettingSpec =
  | { type: "enum"; values: readonly string[] }
  | { type: "positive-integer"; hint: string; example: string }
  | { type: "integer-range"; min: number; max: number; example: string }
  | { type: "boolean" }
  | { type: "timezone" };

export const KEY_CANONICAL: Readonly<Record<string, string>> = {
  "budget.dailyresethour": "budget.dailyResetHour",
  "budget.weeklyresetday": "budget.weeklyResetDay",
  "toast.durationms": "toast.durationMs",
};

export const SETTING_SPECS: Readonly<Record<string, SettingSpec>> = {
  display: { type: "enum", values: ["compact", "normal", "extend", "text"] },
  unit: { type: "enum", values: ["tokens", "cost"] },
  enrichment: { type: "enum", values: ["off", "auto", "manual", "opencode-quota"] },
  lang: { type: "enum", values: ["auto", "en", "ko", "ja", "zh"] },
  retention: { type: "positive-integer", hint: "days", example: "90" },
  "budget.daily": { type: "positive-integer", hint: "tokens", example: "500000" },
  "budget.weekly": { type: "positive-integer", hint: "tokens", example: "3000000" },
  "budget.monthly": { type: "positive-integer", hint: "tokens", example: "10000000" },
  "budget.timezone": { type: "timezone" },
  "budget.dailyResetHour": { type: "integer-range", min: 0, max: 23, example: "9" },
  "budget.weeklyResetDay": {
    type: "enum",
    values: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  },
  "toast.enabled": { type: "boolean" },
  "toast.durationMs": { type: "positive-integer", hint: "ms", example: "9000" },
};

function specHint(spec: SettingSpec): string {
  switch (spec.type) {
    case "enum":
      return spec.values.join(" | ");
    case "positive-integer":
      return `<number>  (${spec.hint})`;
    case "integer-range":
      return `<number>  (${spec.min}–${spec.max})`;
    case "boolean":
      return "true | false";
    case "timezone":
      return "IANA timezone  e.g. Asia/Seoul";
  }
}

function specExample(spec: SettingSpec): string {
  switch (spec.type) {
    case "enum":
      return spec.values[0] ?? "";
    case "positive-integer":
      return spec.example;
    case "integer-range":
      return spec.example;
    case "boolean":
      return "true";
    case "timezone":
      return "Asia/Seoul";
  }
}

function validateSettingValue(key: string, value: SettingValue): string | null {
  const spec = SETTING_SPECS[key];
  if (spec === undefined) return null;
  switch (spec.type) {
    case "enum":
      if (!spec.values.includes(String(value))) {
        return `Invalid value for ${key}: "${value}"\n  Valid: ${spec.values.join(" | ")}`;
      }
      return null;
    case "positive-integer":
      if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
        return `Invalid value for ${key}: "${value}"\n  Expected: positive integer  e.g. ${spec.example}`;
      }
      return null;
    case "integer-range":
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < spec.min ||
        value > spec.max
      ) {
        return `Invalid value for ${key}: "${value}"\n  Expected: integer ${spec.min}–${spec.max}`;
      }
      return null;
    case "boolean":
      if (typeof value !== "boolean") {
        return `Invalid value for ${key}: "${value}"\n  Valid: true | false`;
      }
      return null;
    case "timezone":
      try {
        Intl.DateTimeFormat(undefined, { timeZone: String(value) });
        return null;
      } catch {
        return `Invalid timezone: "${value}"\n  Expected: IANA timezone  e.g. Asia/Seoul`;
      }
  }
}

function findTodayTotal(rows: RollupRow[]): UsageTotals {
  const totalRow = rows.find((row) => row.kind === "total" && row.name === "*");

  if (totalRow !== undefined) {
    return totalRow;
  }

  return rows
    .filter((row) => row.kind === "provider")
    .reduce<UsageTotals>(
      (totals, row) => ({
        inp: totals.inp + row.inp,
        out: totals.out + row.out,
        think: totals.think + row.think,
        chat: totals.chat + row.chat,
        code: totals.code + row.code,
        cache_r: totals.cache_r + row.cache_r,
        cache_w: totals.cache_w + row.cache_w,
      }),
      { inp: 0, out: 0, think: 0, chat: 0, code: 0, cache_r: 0, cache_w: 0 },
    );
}

function buildSettingPreview(textMode: boolean): string {
  const rows = getTodayRollups();
  const providerRows = rows
    .filter((row) => row.kind === "provider")
    .sort((left, right) => computeTotalTokens(right) - computeTotalTokens(left));

  if (providerRows.length === 0) {
    return [
      "oh-my-tokens — Today's Summary",
      SECTION_RULE,
      "No usage recorded today.",
      SECTION_RULE,
    ].join("\n");
  }

  const total = computeTotalTokens(findTodayTotal(rows));
  const labelWidth = Math.max(10, ...providerRows.map((row) => row.name.length));

  return [
    "oh-my-tokens — Today's Summary",
    SECTION_RULE,
    ...providerRows.map((row) => {
      const providerTotal = computeTotalTokens(row);
      const percent = total > 0 ? (providerTotal / total) * 100 : 0;
      return formatUsageLine(row.name, percent, providerTotal, labelWidth, textMode);
    }),
    SECTION_RULE,
  ].join("\n");
}

function buildUnknownSettingOutput(key: string): string {
  return [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `Unknown setting: ${key}`,
    "Run /omt setting to see all available settings.",
  ].join("\n");
}

function buildSettingHintOutput(key: string, spec: SettingSpec): string {
  const hint = specHint(spec);
  const example = specExample(spec);
  const current = readCurrentSettingValue(getEffectivePluginConfig(), key);
  const lines = [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `  ${key.padEnd(24)} ${hint}`,
    ...(current !== undefined ? [`  Current: ${String(current)}`] : []),
    "",
    `Usage:   /omt setting ${key} ${example}`,
    SECTION_RULE,
  ];
  return lines.join("\n");
}

function buildSettingSuccessOutput(
  key: string,
  value: SettingValue,
  configPath: string,
  result: { oldValue?: SettingValue },
  onSettingApplied?: () => void,
): string {
  const oldLabel = result.oldValue !== undefined ? String(result.oldValue) : "(not set)";
  const lines = [
    "oh-my-tokens — Settings",
    SECTION_RULE,
    `✓ ${key}   ${oldLabel} → ${String(value)}`,
    `Config   ${configPath}`,
  ];
  if (onSettingApplied === undefined) {
    lines.push("Restart OpenCode to apply changes.");
  }
  lines.push(SECTION_RULE);
  if (
    key === "display" &&
    (value === "compact" || value === "normal" || value === "extend" || value === "text")
  ) {
    lines.push("", buildSectionDivider("Preview"));
    lines.push(buildSettingPreview(value === "text" || getDisplayMode() === "text"));
  }
  return lines.join("\n");
}

export function buildSettingCommandOutput(rawTail: string, onSettingApplied?: () => void): string {
  const omtConfigPath = findOhMyTokensConfigPath();
  if (rawTail.trim() === "") {
    return buildSettingDisplay();
  }
  const parts = rawTail.split(/\s+/);
  const rawKey = (parts[0] ?? "").toLowerCase();
  const key = KEY_CANONICAL[rawKey] ?? rawKey;
  const rawValue = parts.slice(1).join(" ");
  if (rawValue === "") {
    const spec = SETTING_SPECS[key];
    return spec === undefined ? buildUnknownSettingOutput(key) : buildSettingHintOutput(key, spec);
  }
  const value = coerceSettingValue(rawValue);
  const validationError = validateSettingValue(key, value);
  if (validationError !== null) {
    return ["oh-my-tokens — Settings", SECTION_RULE, `✗ ${validationError}`].join("\n");
  }
  const result = applyOhMyTokensSetting(omtConfigPath, key, value);
  if (!result.ok) {
    return ["oh-my-tokens — Settings", SECTION_RULE, `✗ ${result.error}`].join("\n");
  }
  onSettingApplied?.();
  return buildSettingSuccessOutput(key, value, omtConfigPath, result, onSettingApplied);
}
