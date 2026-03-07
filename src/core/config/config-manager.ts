/**
 * Daemon Configuration Manager
 *
 * Manages the daemon's configuration with support for hot-reload.
 */

import { loadConfig } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('config-manager');

export interface ReloadResult {
  success: boolean;
  reloaded: string[];
  requiresRestart: string[];
  error?: string;
}

// Settings that can be hot-reloaded (simple equality check)
const HOT_RELOADABLE_KEYS = ['hostname', 'caddy_admin_api', 'tmux_mode', 'auto_attach'] as const;

// Settings that require restart (simple equality check)
const RESTART_REQUIRED_KEYS = ['daemon_port', 'base_path'] as const;

// Settings that require restart (JSON comparison)
const RESTART_REQUIRED_ARRAY_KEYS = ['listen_addresses', 'listen_sockets'] as const;

// Terminal UI keys to check
const TERMINAL_UI_KEYS = [
  'font_size_default_mobile',
  'font_size_default_pc',
  'font_size_min',
  'font_size_max',
  'double_tap_delay'
] as const;

function checkSessionChanges(oldConfig: Config, newConfig: Config): boolean {
  const oldSessionNames = new Set(oldConfig.sessions.map((s) => s.name));
  const newSessionNames = new Set(newConfig.sessions.map((s) => s.name));
  return (
    oldSessionNames.size !== newSessionNames.size ||
    ![...oldSessionNames].every((n) => newSessionNames.has(n))
  );
}

/**
 * Compare two configs and identify what changed
 */
function detectChanges(
  oldConfig: Config,
  newConfig: Config
): { hotReloadable: string[]; requiresRestart: string[] } {
  const hotReloadable: string[] = [];
  const requiresRestart: string[] = [];

  // Check terminal UI config
  for (const key of TERMINAL_UI_KEYS) {
    if (oldConfig.terminal_ui[key] !== newConfig.terminal_ui[key]) {
      hotReloadable.push(`terminal_ui.${key}`);
    }
  }

  // Check session definitions
  if (checkSessionChanges(oldConfig, newConfig)) {
    hotReloadable.push('sessions');
  }

  // Check hot-reloadable settings
  for (const key of HOT_RELOADABLE_KEYS) {
    if (oldConfig[key] !== newConfig[key]) {
      hotReloadable.push(key);
    }
  }

  // Check settings that require restart (simple comparison)
  for (const key of RESTART_REQUIRED_KEYS) {
    if (oldConfig[key] !== newConfig[key]) {
      requiresRestart.push(key);
    }
  }

  // Check settings that require restart (array comparison)
  for (const key of RESTART_REQUIRED_ARRAY_KEYS) {
    if (JSON.stringify(oldConfig[key]) !== JSON.stringify(newConfig[key])) {
      requiresRestart.push(key);
    }
  }

  return { hotReloadable, requiresRestart };
}

class ConfigManager {
  private config: Config;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.config = loadConfig(configPath);
  }

  /**
   * Get the current configuration
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Reload configuration from disk
   */
  reload(): ReloadResult {
    try {
      const newConfig = loadConfig(this.configPath);
      const { hotReloadable, requiresRestart } = detectChanges(this.config, newConfig);

      if (hotReloadable.length === 0 && requiresRestart.length === 0) {
        log.info('Config reload: no changes detected');
        return {
          success: true,
          reloaded: [],
          requiresRestart: []
        };
      }

      // Apply the new config
      this.config = newConfig;

      log.info(`Config reloaded: ${hotReloadable.length} settings updated`);
      if (hotReloadable.length > 0) {
        log.info(`  Hot-reloaded: ${hotReloadable.join(', ')}`);
      }
      if (requiresRestart.length > 0) {
        log.warn(`  Requires restart: ${requiresRestart.join(', ')}`);
      }

      return {
        success: true,
        reloaded: hotReloadable,
        requiresRestart
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Config reload failed: ${message}`);
      return {
        success: false,
        reloaded: [],
        requiresRestart: [],
        error: message
      };
    }
  }
}

// Singleton instance
let instance: ConfigManager | null = null;

/**
 * Initialize the config manager
 */
export function initConfigManager(configPath?: string): ConfigManager {
  instance = new ConfigManager(configPath);
  return instance;
}

/**
 * Get the config manager instance
 */
export function getConfigManager(): ConfigManager {
  if (!instance) {
    throw new Error('ConfigManager not initialized. Call initConfigManager first.');
  }
  return instance;
}

/**
 * Get the current config (convenience function)
 */
export function getCurrentConfig(): Config {
  return getConfigManager().getConfig();
}

/**
 * Reload the config (convenience function)
 */
export function reloadConfig(): ReloadResult {
  return getConfigManager().reload();
}
