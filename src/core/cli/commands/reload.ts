/**
 * Reload command - Reload daemon configuration
 */

import { sendCommand } from '@/core/client/daemon-client.js';

export interface ReloadOptions {
  config?: string;
}

export interface ReloadResult {
  success: boolean;
  reloaded: string[];
  requiresRestart: string[];
  error?: string;
}

function printDaemonNotRunning(): never {
  process.exit(1);
}

function printReloadedSettings(reloaded: string[]): void {
  if (reloaded.length === 0) {
    return;
  }
  for (const _setting of reloaded) {
  }
}

function printRestartRequired(requiresRestart: string[]): void {
  if (requiresRestart.length === 0) {
    return;
  }
  for (const _setting of requiresRestart) {
  }
}

export async function reloadCommand(_options: ReloadOptions): Promise<void> {
  try {
    const response = await sendCommand('reload');

    if (!response) {
      printDaemonNotRunning();
    }

    const result: ReloadResult = JSON.parse(response);

    if (!result.success) {
      process.exit(1);
    }

    if (result.reloaded.length === 0 && result.requiresRestart.length === 0) {
      return;
    }

    printReloadedSettings(result.reloaded);
    printRestartRequired(result.requiresRestart);
  } catch (error) {
    if (error instanceof Error && error.message.includes('ENOENT')) {
      printDaemonNotRunning();
    }
    process.exit(1);
  }
}
