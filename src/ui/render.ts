import { formatTokens } from "./formatter";

export const SECTION_WIDTH = 42;
export const SECTION_RULE = "═".repeat(SECTION_WIDTH);
export const BAR_WIDTH = 16;
export const LABEL_AREA_MIN = 10;
export const QUOTA_PREFIX_WIDTH = 6;

export function visualWidth(s: string): number {
  let width = 0;
  for (const char of [...s]) {
    const code = char.codePointAt(0);
    if (code === undefined || code === 0xfe0f || code === 0x200d) {
      continue;
    }
    if (
      (code >= 0x1f300 && code <= 0x1faff) ||
      (code >= 0x2300 && code <= 0x27ff) ||
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      width += 2;
      continue;
    }
    width += 1;
  }
  return width;
}

export function padVisualEnd(s: string, targetWidth: number): string {
  const current = visualWidth(s);
  const padding = Math.max(0, targetWidth - current);
  return s + " ".repeat(padding);
}

export function buildSectionDivider(name: string): string {
  const prefix = `─── ${name} `;
  const trailing = Math.max(4, SECTION_WIDTH - prefix.length);
  return `${prefix}${"─".repeat(trailing)}`;
}

export function buildBar(percent: number, width = BAR_WIDTH): string {
  const normalized = Math.max(0, Math.min(percent, 100));
  const filled = Math.round((normalized / 100) * width);
  return `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
}

export function formatUsageLine(
  label: string,
  percent: number,
  tokens: number,
  labelWidth = 10,
  textMode = false,
  costStr?: string,
): string {
  const valueStr =
    costStr !== undefined ? costStr.padStart(7) : `${formatTokens(tokens).padStart(6)} tok`;
  if (textMode) {
    return `  ${padVisualEnd(label, labelWidth)}   ${valueStr}  (${percent.toFixed(0)}%)`;
  }
  return `  ${padVisualEnd(label, labelWidth)} ${buildBar(percent)} ${`${percent.toFixed(0)}%`.padStart(4)}   ${valueStr}`;
}

export function buildProviderSectionHeader(name: string, tokLabel?: string): string {
  if (tokLabel !== undefined) {
    const headerPrefix = `─── ${name} ─── ${tokLabel} today `;
    const dashFill = Math.max(4, SECTION_WIDTH - headerPrefix.length);
    return `${headerPrefix}${"─".repeat(dashFill)}`;
  }
  return buildSectionDivider(name);
}

export function formatTimeUntil(isoString: string): string {
  const ms = new Date(isoString).getTime() - Date.now();
  if (ms <= 0) return "now";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function buildProviderQuotaLine(
  icon: string,
  label: string,
  pctUsed: number,
  resetTimeIso?: string,
  textMode = false,
): string {
  const pctStr = `${pctUsed}%`.padStart(4);
  const resetStr = resetTimeIso ? `  resets ${formatTimeUntil(resetTimeIso)}` : "";
  const prefix = padVisualEnd(`${icon} ${label}`, QUOTA_PREFIX_WIDTH);
  if (textMode) {
    return `  ${prefix}   ${pctStr} used${resetStr}  [live]`;
  }
  return `  ${prefix}   ${buildBar(pctUsed)} ${pctStr}${resetStr}  [live]`;
}
