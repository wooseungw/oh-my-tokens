import type { Plugin } from "@opencode-ai/plugin";

import { setBudgetConfig } from "./analytics/budget";
import { type ProviderConfig, setProviderConfigs } from "./analytics/plans";
import { setLiveQuotas } from "./analytics/quota";
import { extractBudgetConfig, readPluginConfigFromFile } from "./config/reader";
import { initKnownAuthProviders, setupAuthWatcher } from "./enrichment/auth-watcher";
import type { ProviderQuota } from "./enrichment/providers";
import { type EnrichmentConfig, normalizeMode, resolveEnrichment } from "./enrichment/resolver";
import { findOpencodeConfigPath } from "./paths";
import { createPipelineHooks } from "./pipeline";
import { runBackfill } from "./storage/backfill";
import { setWeeklyResetDay } from "./storage/rollup";
import { handleOmtCommand } from "./ui/commands/index";
import { checkForUpdate } from "./update-check";

export { buildSidebarItems as getSidebarItems } from "./ui/sidebar";

let _enrichmentConfig: EnrichmentConfig = { mode: "off" };

async function refreshLiveQuotas(): Promise<void> {
  if (_enrichmentConfig.mode === "off") return;

  try {
    const quotas = (await resolveEnrichment(_enrichmentConfig))
      .map((result) => result.quota)
      .filter((quota): quota is ProviderQuota => quota !== null);
    setLiveQuotas(quotas);
  } catch {}
}

const COMMAND_HANDLED_SENTINEL = "__OH_MY_TOKENS_COMMAND_HANDLED__" as const;
const command = (template: string, description: string) => ({ template, description });
const OMT_COMMANDS = {
  omt: command("/omt", "Show today's token summary with provider breakdown."),
  omt_agents: command("/omt agents", "Show agent-by-agent token usage."),
  omt_models: command("/omt models", "Show model-level token breakdown for today."),
  omt_trend: command("/omt trend", "Show the 7-day token trend report."),
  omt_budget: command("/omt budget", "Show daily, weekly, and monthly token budget status."),
  omt_export: command("/omt export", "Export today's token usage as JSON."),
  omt_export_csv: command("/omt export csv", "Export today's token usage as CSV."),
  omt_sessions: command("/omt sessions", "Show top sessions by token usage (last 7 days)."),
  omt_hours: command("/omt hours", "Show hourly token usage heatmap for today."),
  omt_status: command("/omt status", "Show plugin diagnostics and storage status."),
  omt_rebuild: command("/omt rebuild", "Rebuild rollup aggregates from recorded events."),
  omt_limits: command(
    "/omt limits",
    "Show per-provider token limits by time window (hourly/daily/weekly/monthly).",
  ),
  omt_setting: command("/omt setting", "View or change plugin settings in opencode.json."),
} as const;
const COMMAND_ARGS: Readonly<Record<string, string>> = {
  omt: "",
  omt_agents: "agents",
  omt_models: "models",
  omt_trend: "trend",
  omt_budget: "budget",
  omt_export: "export",
  omt_export_csv: "export csv",
  omt_sessions: "sessions",
  omt_hours: "hours",
  omt_status: "status",
  omt_rebuild: "rebuild",
  omt_limits: "limits",
  omt_setting: "setting",
};

function handled(): never {
  throw new Error(COMMAND_HANDLED_SENTINEL);
}

export const OhMyTokensPlugin: Plugin = async (input) => {
  async function injectRawOutput(sessionID: string, text: string): Promise<void> {
    await input.client.session.prompt({
      path: { id: sessionID },
      body: { noReply: true, parts: [{ type: "text", text, ignored: true }] },
    });
  }

  function applyPluginConfig(): void {
    const pluginCfg = readPluginConfigFromFile(findOpencodeConfigPath());
    const providers = pluginCfg.providers as Record<string, ProviderConfig> | undefined;
    if (providers !== undefined) setProviderConfigs(providers);
    if (pluginCfg.budget !== undefined) {
      const budgetConfig = extractBudgetConfig(pluginCfg);
      setBudgetConfig(budgetConfig);
      setWeeklyResetDay(budgetConfig.weeklyResetDay);
    }
    _enrichmentConfig = {
      mode: normalizeMode(pluginCfg.enrichment as string | undefined),
      providers: pluginCfg.providers as
        | Record<string, { budget: number; unit: "tokens" | "requests"; period: string }>
        | undefined,
    };
    if (_enrichmentConfig.mode !== "off") refreshLiveQuotas().catch(() => {});
  }

  initKnownAuthProviders();
  setupAuthWatcher((provider) => {
    input.client.tui
      .showToast({
        body: {
          title: "oh-my-tokens",
          message: `${provider} connected ✓`,
          variant: "success",
          duration: 9000,
        },
      })
      .catch(() => {});
    refreshLiveQuotas().catch(() => {});
  });
  runBackfill().catch(() => {});
  checkForUpdate()
    .then((update) => {
      if (update === null) return;
      return input.client.tui.showToast({
        body: {
          title: "oh-my-tokens — Update Available",
          message: `v${update.latestVersion} is available  (you have v${update.currentVersion})\nnpm install oh-my-tokens@latest`,
          variant: "info",
          duration: 15000,
        },
      });
    })
    .catch(() => {});
  const hooks = createPipelineHooks(input);

  return {
    ...hooks,
    config: async (config) => {
      config.command ??= {};
      Object.assign(config.command, OMT_COMMANDS);
      applyPluginConfig();
    },
    "command.execute.before": async (commandInput, _output) => {
      const fixedArgs = COMMAND_ARGS[commandInput.command];
      if (fixedArgs === undefined) return;
      const args =
        commandInput.command === "omt"
          ? commandInput.arguments
          : commandInput.command === "omt_setting"
            ? (() => {
                const trailing = commandInput.arguments?.trim() ?? "";
                return trailing.length > 0 ? `setting ${trailing}` : "setting";
              })()
            : fixedArgs;
      const result = handleOmtCommand(args, commandInput.sessionID, applyPluginConfig);
      await injectRawOutput(commandInput.sessionID, result.text);
      handled();
    },
  };
};

export default OhMyTokensPlugin;
