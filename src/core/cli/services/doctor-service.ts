/**
 * Doctor Service
 *
 * Health check system with pluggable checks.
 */

import { execSync } from 'node:child_process';
import { isDaemonRunning } from '@/core/client/index.js';
import { findConfigPath, loadConfig } from '@/core/config/config.js';
import { validateEnvAtStartup } from '@/core/config/env.js';
import type { Config } from '@/core/config/types.js';

const VERSION_REGEX = /(\d+\.\d+[\.\d]*)/;

/**
 * Result of a single health check
 */
export interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  hint?: string;
}

/**
 * Context passed to checks
 */
export interface CheckContext {
  configPath?: string;
  config?: Config;
}

/**
 * Interface for pluggable health checks
 */
export interface DoctorCheck {
  readonly name: string;
  run(ctx: CheckContext): Promise<CheckResult> | CheckResult;
}

/**
 * Execute a command and return its output, or null if it fails
 */
function tryExec(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if Bun version meets requirements
 */
export class BunCheck implements DoctorCheck {
  readonly name = 'bun';

  run(): CheckResult {
    const output = tryExec('bun --version');
    if (!output) {
      return {
        name: this.name,
        ok: false,
        message: 'Bun not found',
        hint: 'Install Bun: https://bun.sh'
      };
    }

    const version = output.trim();
    const [major] = version.split('.').map(Number);
    if (major !== undefined && major >= 1) {
      return {
        name: this.name,
        ok: true,
        message: `Bun ${version} found`
      };
    }

    return {
      name: this.name,
      ok: false,
      message: `Bun ${version} found (requires 1.0+)`,
      hint: 'Upgrade Bun: bun upgrade'
    };
  }
}

/**
 * Check if tmux is installed
 */
export class TmuxCheck implements DoctorCheck {
  readonly name = 'tmux';

  run(): CheckResult {
    const output = tryExec('tmux -V');
    if (output) {
      const versionMatch = output.match(VERSION_REGEX);
      const version = versionMatch ? versionMatch[1] : 'unknown';
      return {
        name: this.name,
        ok: true,
        message: `tmux ${version} found`
      };
    }
    return {
      name: this.name,
      ok: true, // tmux is optional
      message: 'tmux not found (optional)',
      hint: 'Install tmux to enable "bunterm attach" command'
    };
  }
}

/**
 * Check if config file exists and is valid
 */
export class ConfigCheck implements DoctorCheck {
  readonly name = 'config';

  run(ctx: CheckContext): CheckResult {
    const path = ctx.configPath ?? findConfigPath();

    if (!path) {
      return {
        name: this.name,
        ok: true,
        message: 'config.yaml not found (using defaults)'
      };
    }

    try {
      loadConfig(ctx.configPath);
      return {
        name: this.name,
        ok: true,
        message: `config.yaml valid (${path})`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: this.name,
        ok: false,
        message: `config.yaml invalid: ${message}`,
        hint: 'Check YAML syntax in config file'
      };
    }
  }
}

/**
 * Check if daemon is running
 */
export class DaemonCheck implements DoctorCheck {
  readonly name = 'daemon';

  async run(): Promise<CheckResult> {
    const running = await isDaemonRunning();
    if (running) {
      return {
        name: this.name,
        ok: true,
        message: 'daemon running'
      };
    }
    return {
      name: this.name,
      ok: true, // Not an error, just informational
      message: 'daemon not running',
      hint: 'Start with: bunterm start'
    };
  }
}

/**
 * Check if daemon port is available
 */
export class PortCheck implements DoctorCheck {
  readonly name = 'port';

  run(ctx: CheckContext): CheckResult {
    const port = ctx.config?.daemon_port ?? 7680;
    const output = tryExec(`lsof -i :${port} -t 2>/dev/null || ss -tlnp 2>/dev/null | grep :${port}`);

    if (!output) {
      return {
        name: this.name,
        ok: true,
        message: `port ${port} available`
      };
    }

    return {
      name: this.name,
      ok: true, // May be used by our daemon
      message: `port ${port} in use`,
      hint: 'This may be the bunterm daemon or another process'
    };
  }
}

/**
 * Check environment variables
 */
export class EnvCheck implements DoctorCheck {
  readonly name = 'env';

  run(): CheckResult {
    const errors = validateEnvAtStartup();

    if (errors.length === 0) {
      return {
        name: this.name,
        ok: true,
        message: 'environment variables valid'
      };
    }

    return {
      name: this.name,
      ok: false,
      message: `environment variable issues: ${errors[0]}`,
      hint: errors.length > 1 ? `(and ${errors.length - 1} more issues)` : undefined
    };
  }
}

/**
 * Default checks registry
 */
export const defaultChecks: DoctorCheck[] = [
  new BunCheck(),
  new TmuxCheck(),
  new ConfigCheck(),
  new EnvCheck(),
  new DaemonCheck(),
  new PortCheck()
];

/**
 * Run all checks and return results
 */
export async function runChecks(
  checks: DoctorCheck[],
  ctx: CheckContext
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of checks) {
    // Skip port check if config is invalid
    if (check.name === 'port' && !ctx.config) {
      continue;
    }
    results.push(await check.run(ctx));
  }

  return results;
}

/**
 * Format check result for display
 */
export function formatCheckResult(result: CheckResult): string {
  const icon = result.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
  let output = `${icon} ${result.name}: ${result.message}`;
  if (result.hint && !result.ok) {
    output += `\n  Hint: ${result.hint}`;
  }
  return output;
}

/**
 * Check if any results indicate a failure (excluding informational checks like daemon)
 */
export function hasFailures(results: CheckResult[]): boolean {
  return results.some((r) => !r.ok && r.name !== 'daemon');
}
