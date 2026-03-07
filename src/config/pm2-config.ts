/**
 * PM2 Configuration Generator
 *
 * Generates ecosystem.config.cjs for pm2 in the user's config directory.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getConfigDir } from './state.js';

const PM2_CONFIG_FILENAME = 'ecosystem.config.cjs';

/**
 * Get the path to the pm2 ecosystem config file
 */
export function getPm2ConfigPath(): string {
  return resolve(getConfigDir(), PM2_CONFIG_FILENAME);
}

/**
 * Detect the bunterm executable path
 */
function detectBuntermPath(): { interpreter: string; script: string } {
  const arg1 = process.argv[1];

  // If running via bun run src/index.ts
  if (arg1?.endsWith('.ts')) {
    return {
      interpreter: 'bun',
      script: resolve(arg1)
    };
  }

  // If running via compiled binary or symlink
  if (arg1 && arg1 !== process.execPath) {
    return {
      interpreter: 'bun',
      script: resolve(arg1)
    };
  }

  // Fallback: try to find bunterm in PATH
  return {
    interpreter: 'bun',
    script: 'bunterm'
  };
}

/**
 * Generate pm2 ecosystem config content
 */
export function generatePm2Config(options?: {
  maxRestarts?: number;
  maxMemory?: string;
  configPath?: string;
}): string {
  const { interpreter, script } = detectBuntermPath();
  const stateDir = process.env['HOME'] + '/.local/state/ttyd-mux';

  const args = ['start', '-f'];
  if (options?.configPath) {
    args.push('-c', options.configPath);
  }

  const config = {
    apps: [
      {
        name: 'bunterm',
        script,
        interpreter,
        args: args.join(' '),

        // Auto-restart settings
        autorestart: true,
        max_restarts: options?.maxRestarts ?? 10,
        min_uptime: '10s',
        restart_delay: 1000,

        // Watch for crashes
        watch: false,

        // Environment
        env: {
          NODE_ENV: 'production'
        },

        // Logging
        error_file: `${stateDir}/pm2-error.log`,
        out_file: `${stateDir}/pm2-out.log`,
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

        // Resource limits
        max_memory_restart: options?.maxMemory ?? '500M'
      }
    ]
  };

  return `module.exports = ${JSON.stringify(config, null, 2)};\n`;
}

/**
 * Ensure pm2 config file exists, creating it if necessary
 */
export function ensurePm2Config(options?: {
  maxRestarts?: number;
  maxMemory?: string;
  configPath?: string;
  force?: boolean;
}): string {
  const configPath = getPm2ConfigPath();

  // Create config directory if it doesn't exist
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Create or update config file
  if (!existsSync(configPath) || options?.force) {
    const content = generatePm2Config(options);
    writeFileSync(configPath, content, 'utf-8');
  }

  return configPath;
}

/**
 * Check if pm2 config exists
 */
export function hasPm2Config(): boolean {
  return existsSync(getPm2ConfigPath());
}
