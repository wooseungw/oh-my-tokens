import { formatTokens } from "./formatter";

export const SECTION_WIDTH = 42;
export const SECTION_RULE = "═".repeat(SECTION_WIDTH);
export const BAR_WIDTH = 16;

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
): string {
  if (textMode) {
    return `  ${label.padEnd(labelWidth)}   ${formatTokens(tokens).padStart(6)} tok  (${percent.toFixed(0)}%)`;
  }
  return `  ${label.padEnd(labelWidth)} ${buildBar(percent)} ${`${percent.toFixed(0)}%`.padStart(4)}   ${formatTokens(tokens).padStart(6)} tok`;
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
  if (textMode) {
    return `  ${icon} ${label.padEnd(3)}   ${pctStr} used${resetStr}  [live]`;
  }
  return `  ${icon} ${label.padEnd(3)}   ${buildBar(pctUsed)} ${pctStr}${resetStr}  [live]`;
}
