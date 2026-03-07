import { execSync } from 'node:child_process';
import { isDaemonRunning } from '@/core/client/index.js';
import { findConfigPath, loadConfig } from '@/core/config/config.js';

// Top-level regex for version extraction
const VERSION_REGEX = /(\d+\.\d+[\.\d]*)/;

export interface DoctorOptions {
  config?: string;
}

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  hint?: string;
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
 * Check if a command exists and get its version
 */
function checkCommand(name: string, versionFlag = '--version'): CheckResult {
  const output = tryExec(`${name} ${versionFlag}`);
  if (output) {
    // Extract version number from output
    const versionMatch = output.match(VERSION_REGEX);
    const version = versionMatch ? versionMatch[1] : 'unknown';
    return {
      name,
      ok: true,
      message: `${name} ${version} found`
    };
  }
  return {
    name,
    ok: false,
    message: `${name} not found`,
    hint: `Install ${name} to use bunterm`
  };
}

/**
 * Check if Bun version meets requirements
 */
function checkBun(): CheckResult {
  const output = tryExec('bun --version');
  if (!output) {
    return {
      name: 'bun',
      ok: false,
      message: 'Bun not found',
      hint: 'Install Bun: https://bun.sh'
    };
  }

  const version = output.trim();
  const [major] = version.split('.').map(Number);
  if (major !== undefined && major >= 1) {
    return {
      name: 'bun',
      ok: true,
      message: `Bun ${version} found`
    };
  }

  return {
    name: 'bun',
    ok: false,
    message: `Bun ${version} found (requires 1.0+)`,
    hint: 'Upgrade Bun: bun upgrade'
  };
}

/**
 * Check if config file exists and is valid
 */
function checkConfig(configPath?: string): CheckResult {
  const path = configPath ?? findConfigPath();

  if (!path) {
    return {
      name: 'config',
      ok: true,
      message: 'config.yaml not found (using defaults)'
    };
  }

  try {
    loadConfig(configPath);
    return {
      name: 'config',
      ok: true,
      message: `config.yaml valid (${path})`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      name: 'config',
      ok: false,
      message: `config.yaml invalid: ${message}`,
      hint: 'Check YAML syntax in config file'
    };
  }
}

/**
 * Check if daemon is running
 */
async function checkDaemon(): Promise<CheckResult> {
  const running = await isDaemonRunning();
  if (running) {
    return {
      name: 'daemon',
      ok: true,
      message: 'daemon running'
    };
  }
  return {
    name: 'daemon',
    ok: true, // Not an error, just informational
    message: 'daemon not running',
    hint: 'Start with: bunterm start'
  };
}

/**
 * Check if daemon port is available
 */
function checkPort(port: number): CheckResult {
  // Try to check if port is in use
  const output = tryExec(`lsof -i :${port} -t 2>/dev/null || ss -tlnp 2>/dev/null | grep :${port}`);

  if (!output) {
    return {
      name: 'port',
      ok: true,
      message: `port ${port} available`
    };
  }

  return {
    name: 'port',
    ok: true, // May be used by our daemon
    message: `port ${port} in use`,
    hint: 'This may be the bunterm daemon or another process'
  };
}

/**
 * Run all checks and display results
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  const results: CheckResult[] = [];

  // Check required commands
  results.push(checkBun());
  // tmux is optional (only needed for attach command)
  results.push(checkCommand('tmux', '-V'));

  // Check config
  results.push(checkConfig(options.config));

  // Check daemon
  results.push(await checkDaemon());

  // Check port (load config to get port)
  try {
    const config = loadConfig(options.config);
    results.push(checkPort(config.daemon_port));
  } catch {
    // Config check already failed, skip port check
  }

  // Display results
  let hasErrors = false;
  for (const result of results) {
    const icon = result.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.hint && !result.ok) {
      console.log(`  Hint: ${result.hint}`);
    }
    if (!result.ok && result.name !== 'daemon') {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
  }
}
