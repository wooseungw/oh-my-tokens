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

function getOhMyTokensConfigPath(opencodeConfigPath) {
  return join(dirname(opencodeConfigPath), "oh-my-tokens.json");
}

function migrateFromOpencodeJson(opencodeConfigPath, omtConfigPath) {
  if (existsSync(omtConfigPath)) return;
  if (!existsSync(opencodeConfigPath)) return;
  let config;
  try {
    config = JSON.parse(readFileSync(opencodeConfigPath, "utf8"));
  } catch {
    return;
  }
  const existing = config.experimental?.[PLUGIN_NAME];
  if (!existing || typeof existing !== "object" || Object.keys(existing).length === 0) return;
  writeFileSync(omtConfigPath, JSON.stringify(existing, null, 2) + "\n", "utf8");
  console.log(`[oh-my-tokens] ✓ migrated settings from opencode.json → ${omtConfigPath}`);
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

  const opencodeChanges = [];

  if (!Array.isArray(config.plugin)) config.plugin = [];
  if (!config.plugin.includes(PLUGIN_NAME)) {
    config.plugin.push(PLUGIN_NAME);
    opencodeChanges.push("plugin registered");
  }

  if (opencodeChanges.length > 0) {
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    console.log(`[oh-my-tokens] ✓ ${opencodeChanges.join(", ")} → ${configPath}`);
  } else {
    console.log(`[oh-my-tokens] Already registered in ${configPath}`);
  }

  const omtConfigPath = getOhMyTokensConfigPath(configPath);
  if (!existsSync(omtConfigPath)) {
    const omtConfig = { enrichment: "auto" };
    const tz = detectTimezone();
    if (tz) omtConfig.budget = { timezone: tz };
    writeFileSync(omtConfigPath, JSON.stringify(omtConfig, null, 2) + "\n", "utf8");
    console.log(`[oh-my-tokens] ✓ created ${omtConfigPath}`);
  } else {
    console.log(`[oh-my-tokens] Config already exists: ${omtConfigPath}`);
  }
  migrateFromOpencodeJson(configPath, omtConfigPath);
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
