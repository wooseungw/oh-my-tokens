#!/usr/bin/env node
/**
 * postinstall.mjs
 * Automatically registers "oh-my-tokens" in the user's opencode.json plugin list.
 * Runs after `npm install oh-my-tokens` or `npm install -g oh-my-tokens`.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
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

  // For local install: prefer project-level opencode.json if it exists
  if (!isGlobal && initCwd) {
    const projectConfig = join(initCwd, "opencode.json");
    if (existsSync(projectConfig)) {
      return projectConfig;
    }
  }

  // Global install or no project config → use global config
  return getGlobalConfigPath();
}
function registerPlugin() {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);

  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf8"));
    } catch {
      console.warn(`[oh-my-tokens] Could not parse ${configPath}, skipping auto-registration.`);
      return;
    }
  }
  if (!Array.isArray(config.plugin)) {
    config.plugin = [];
  }
  if (config.plugin.includes(PLUGIN_NAME)) {
    console.log(`[oh-my-tokens] Already registered in ${configPath}`);
    return;
  }
  config.plugin.push(PLUGIN_NAME);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`[oh-my-tokens] ✓ Registered plugin in ${configPath}`);
}

// Skip only when running `npm install` inside the package's own source tree (dev)
const initCwd = process.env.INIT_CWD?.trim() || "";
const isSelfInstall = initCwd !== "" && initCwd.startsWith(packageRoot);
if (!isSelfInstall) {
  try {
    registerPlugin();
  } catch (err) {
    // Never fail the install because of postinstall errors
    console.warn(`[oh-my-tokens] Auto-registration skipped: ${err.message}`);
  }
}
