/**
 * Reload command - Reload daemon configuration
 */

import { sendCommand } from '@/core/client/daemon-client.js';
import { parseReloadResult, type ReloadResult } from '@/core/client/schemas.js';
import { CliError } from '@/utils/errors.js';

export interface ReloadOptions {
  config?: string;
}

export type { ReloadResult };

function throwDaemonNotRunning(): never {
  throw new CliError('Daemon is not running');
}

function printReloadedSettings(reloaded: string[]): void {
  if (reloaded.length === 0) {
    return;
  }
  console.log('Reloaded settings:');
  for (const setting of reloaded) {
    console.log(`  - ${setting}`);
  }
}

function printRestartRequired(requiresRestart: string[]): void {
  if (requiresRestart.length === 0) {
    return;
  }
  console.log('Settings requiring daemon restart:');
  for (const setting of requiresRestart) {
    console.log(`  - ${setting}`);
  }
  console.log('Run "bunterm restart" to apply these changes.');
}

export async function reloadCommand(_options: ReloadOptions): Promise<void> {
  try {
    const response = await sendCommand('reload');

    if (!response) {
      throwDaemonNotRunning();
    }

    const result = parseReloadResult(response);
    if (!result) {
      throw new CliError('Invalid reload response from daemon');
    }

    if (!result.success) {
      throw new CliError(result.error ?? 'Reload failed');
    }

    if (result.reloaded.length === 0 && result.requiresRestart.length === 0) {
      console.log('Configuration unchanged.');
      return;
    }

    printReloadedSettings(result.reloaded);
    printRestartRequired(result.requiresRestart);
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throwDaemonNotRunning();
    }
    throw CliError.from(error, 'Reload failed');
  }
}
