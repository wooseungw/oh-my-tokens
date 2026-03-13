#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_NAME = "oh-my-tokens";
const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");

function getGlobalConfigPath() {
  const home = homedir();
  if (process.platform === "win32") {
    const appData = process.env.APPDATA?.trim();
    if (appData) return join(appData, "opencode", "opencode.json");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfig) return join(xdgConfig, "opencode", "opencode.json");
  return join(home, ".config", "opencode", "opencode.json");
}

function getConfigPath() {
  const isGlobal = process.env.npm_config_global === "true";
  const initCwd = process.env.INIT_CWD?.trim() || "";
  if (!isGlobal && initCwd) {
    const projectConfig = join(initCwd, "opencode.json");
    if (existsSync(projectConfig)) return projectConfig;
  }
  return getGlobalConfigPath();
}

function detectTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function setNested(obj, dotKey, value) {
  const keys = dotKey.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (cur[last] === undefined) {
    cur[last] = value;
    return true;
  }
  return false;
}

function registerPlugin() {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });

  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      console.warn(`[oh-my-tokens] Could not parse ${configPath}, skipping auto-registration.`);
      return;
    }
  }

  const changes = [];

  if (!Array.isArray(config.plugin)) config.plugin = [];
  if (!config.plugin.includes(PLUGIN_NAME)) {
    config.plugin.push(PLUGIN_NAME);
    changes.push("plugin registered");
  }

  if (typeof config.experimental !== "object" || config.experimental === null) {
    config.experimental = {};
  }
  if (
    typeof config.experimental[PLUGIN_NAME] !== "object" ||
    config.experimental[PLUGIN_NAME] === null
  ) {
    config.experimental[PLUGIN_NAME] = {};
  }
  const cfg = config.experimental[PLUGIN_NAME];

  if (setNested(cfg, "enrichment", "auto")) changes.push("enrichment: auto");

  const tz = detectTimezone();
  if (tz && setNested(cfg, "budget.timezone", tz)) changes.push(`budget.timezone: ${tz}`);

  if (changes.length === 0) {
    console.log(`[oh-my-tokens] Already configured in ${configPath}`);
    return;
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`[oh-my-tokens] ✓ ${changes.join(", ")} → ${configPath}`);
}

const initCwd = process.env.INIT_CWD?.trim() || "";
const isSelfInstall = initCwd !== "" && initCwd.startsWith(packageRoot);
if (!isSelfInstall) {
  try {
    registerPlugin();
  } catch (err) {
    console.warn(`[oh-my-tokens] Auto-registration skipped: ${err.message}`);
  }
}
