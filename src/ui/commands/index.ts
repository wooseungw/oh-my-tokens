import { existsSync, readFileSync } from "node:fs";

import { findOhMyTokensConfigPath, findOpencodeConfigPath } from "../../paths";
import { getTodayRollups } from "../../storage/rollup";

import { buildAgentSummary } from "./agents";
import { buildBudgetSummary } from "./budget-cmd";
import { buildLimitsSummary } from "./limits";
import { buildExportOutput, buildStatusOutput, handleOmtRebuild } from "./misc";
import { buildSessionsSummary } from "./sessions";
import { buildSettingCommandOutput } from "./setting";
import { buildTodaySummary } from "./today";
import { buildTrendSummary } from "./trend";

interface ParsedCommand {
  subcommand: string;
  args: string[];
  rawTail: string;
}

function buildCommandText(
  command: ParsedCommand,
  sessionID: string,
  applyConfig?: () => void,
): string {
  const omtPath = findOhMyTokensConfigPath();
  const configPath = existsSync(omtPath) ? omtPath : findOpencodeConfigPath();
  let display: unknown;

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
      const experimental = raw.experimental as Record<string, unknown> | undefined;
      const pluginConfig =
        configPath === omtPath
          ? raw
          : ((experimental?.["oh-my-tokens"] as Record<string, unknown> | undefined) ?? {});
      display = pluginConfig.display;
    } catch {}
  }

  const textMode = display === "text";

  switch (command.subcommand) {
    case "agents":
      return buildAgentSummary(getTodayRollups(), textMode);
    case "trend":
      return buildTrendSummary();
    case "budget":
      return buildBudgetSummary(textMode);
    case "export":
      return buildExportOutput(command.args[0] === "csv" ? "csv" : "json");
    case "status":
      return buildStatusOutput(sessionID);
    case "rebuild":
      return handleOmtRebuild();
    case "limits":
      return buildLimitsSummary(textMode);
    case "sessions":
      return buildSessionsSummary();
    case "setting":
      return buildSettingCommandOutput(command.rawTail, applyConfig);
    default:
      return buildTodaySummary(getTodayRollups(), textMode);
  }
}

export function handleOmtCommand(
  args: string,
  sessionID: string,
  applyConfig?: () => void,
): { text: string } {
  const trimmed = args.trim();
  const lower = trimmed.toLowerCase();
  const tokens = lower.split(/\s+/).filter((token) => token.length > 0);
  const firstSpace = trimmed.indexOf(" ");
  const command: ParsedCommand = {
    subcommand: tokens[0] ?? "",
    args: tokens.slice(1),
    rawTail: firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim(),
  };

  return { text: buildCommandText(command, sessionID, applyConfig) };
}
