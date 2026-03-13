import { existsSync, readFileSync } from "node:fs";
import type { Plugin } from "@opencode-ai/plugin";

import { type BudgetConfig, setBudgetConfig } from "./analytics/budget";
import { type ProviderConfig, setProviderConfigs } from "./analytics/plans";
import { setLiveQuotas } from "./analytics/quota";
import type { ProviderQuota } from "./enrichment/providers";
import { type EnrichmentConfig, normalizeMode, resolveEnrichment } from "./enrichment/resolver";
import { findOpencodeConfigPath } from "./paths";
import { createPipelineHooks } from "./pipeline";
import { runBackfill } from "./storage/backfill";
import { setWeeklyResetDay } from "./storage/rollup";
import { handleOmtCommand } from "./ui/commands";
import { buildSidebarItems, type DisplayMode } from "./ui/sidebar";

let _enrichmentConfig: EnrichmentConfig = { mode: "off" };

async function refreshLiveQuotas(): Promise<void> {
  if (_enrichmentConfig.mode === "off") return;
  try {
    const results = await resolveEnrichment(_enrichmentConfig);
    const quotas = results.map((r) => r.quota).filter((q): q is ProviderQuota => q !== null);
    setLiveQuotas(quotas);
  } catch {
    // noop — live quota refresh is best-effort
  }
}

const COMMAND_HANDLED_SENTINEL = "__OH_MY_TOKENS_COMMAND_HANDLED__" as const;

function handled(): never {
  throw new Error(COMMAND_HANDLED_SENTINEL);
}

const OMT_COMMANDS = {
  omt: {
    template: "/omt",
    description: "Show today's token summary with provider breakdown.",
  },
  omt_agents: {
    template: "/omt agents",
    description: "Show agent-by-agent token usage.",
  },
  omt_trend: {
    template: "/omt trend",
    description: "Show the 7-day token trend report.",
  },
  omt_budget: {
    template: "/omt budget",
    description: "Show daily, weekly, and monthly token budget status.",
  },
  omt_export: {
    template: "/omt export",
    description: "Export today's token usage as JSON.",
  },
  omt_export_csv: {
    template: "/omt export csv",
    description: "Export today's token usage as CSV.",
  },
  omt_status: {
    template: "/omt status",
    description: "Show plugin diagnostics and storage status.",
  },
  omt_rebuild: {
    template: "/omt rebuild",
    description: "Rebuild rollup aggregates from recorded events.",
  },
  omt_limits: {
    template: "/omt limits",
    description: "Show per-provider token limits by time window (hourly/daily/weekly/monthly).",
  },
  omt_setting: {
    template: "/omt setting",
    description: "View or change plugin settings in opencode.json.",
  },
} as const;

const COMMAND_ARGS: Readonly<Record<string, string>> = {
  omt: "",
  omt_agents: "agents",
  omt_trend: "trend",
  omt_budget: "budget",
  omt_export: "export",
  omt_export_csv: "export csv",
  omt_status: "status",
  omt_rebuild: "rebuild",
  omt_limits: "limits",
  omt_setting: "setting",
};

export function getSidebarItems(mode: DisplayMode) {
  return buildSidebarItems(mode);
}
function readPluginConfigFromFile(): Record<string, unknown> | undefined {
  const configPath = findOpencodeConfigPath();
  if (!existsSync(configPath)) return undefined;
  try {
    const root = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    const exp = root.experimental as Record<string, unknown> | undefined;
    return exp?.["oh-my-tokens"] as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

function extractBudgetConfig(pluginCfg: Record<string, unknown> | undefined): void {
  const budgetCfg = pluginCfg?.budget as Record<string, unknown> | undefined;
  if (budgetCfg === undefined) return;
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
  setBudgetConfig(parsed);
  setWeeklyResetDay(parsed.weeklyResetDay);
}

export const OhMyTokensPlugin: Plugin = async (input) => {
  async function injectRawOutput(sessionID: string, text: string): Promise<void> {
    await input.client.session.prompt({
      path: { id: sessionID },
      body: { noReply: true, parts: [{ type: "text", text, ignored: true }] },
    });
  }

  runBackfill().catch(() => {});
  const hooks = createPipelineHooks(input);

  return {
    ...hooks,
    config: async (config) => {
      config.command ??= {};
      Object.assign(config.command, OMT_COMMANDS);
      const pluginCfg = readPluginConfigFromFile();
      const providers = pluginCfg?.providers as Record<string, ProviderConfig> | undefined;
      if (providers !== undefined) setProviderConfigs(providers);
      extractBudgetConfig(pluginCfg);
      _enrichmentConfig = { mode: normalizeMode(pluginCfg?.enrichment as string | undefined) };
      if (_enrichmentConfig.mode !== "off") {
        refreshLiveQuotas().catch(() => {});
      }
    },
    "command.execute.before": async (commandInput, _output) => {
      const fixedArgs = COMMAND_ARGS[commandInput.command];
      if (fixedArgs === undefined) return;
      let args: string;
      if (commandInput.command === "omt") {
        args = commandInput.arguments;
      } else if (commandInput.command === "omt_setting") {
        const trailing = commandInput.arguments?.trim() ?? "";
        args = trailing.length > 0 ? `setting ${trailing}` : "setting";
      } else {
        args = fixedArgs;
      }
      const result = handleOmtCommand(args, commandInput.sessionID);
      await injectRawOutput(commandInput.sessionID, result.text);
      handled();
    },
  };
};

export default OhMyTokensPlugin;
