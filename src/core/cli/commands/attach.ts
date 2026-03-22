/**
 * Attach command - Attach to a tmux session
 *
 * Returns exit code from tmux for proper propagation.
 */

import { createInterface } from 'node:readline/promises';
import {
  attachToTmuxSession,
  discoverSessions,
  isTmuxInstalled
} from '@/core/cli/services/attach-service.js';
import { CliError } from '@/utils/errors.js';

export interface AttachOptions {
  config?: string;
}

/**
 * Attach to a tmux session.
 * Returns the exit code from tmux for propagation to the entrypoint.
 */
export async function attachCommand(
  name: string | undefined,
  options: AttachOptions
): Promise<number | void> {
  // If no name provided, show selection UI
  if (!name) {
    return interactiveAttach(options);
  }

  // Attach to named session
  return attachToSession(name);
}

async function interactiveAttach(options: AttachOptions): Promise<number | void> {
  const sessions = await discoverSessions(options.config);

  if (sessions.length === 0) {
    if (isTmuxInstalled()) {
      console.log('No sessions available.');
    } else {
      console.log('No sessions available. (tmux not installed)');
    }
    return;
  }

  // Simple selection UI
  console.log('Available sessions:');
  sessions.forEach((session, index) => {
    const dirInfo = session.dir ? ` (${session.dir})` : '';
    console.log(`  ${index + 1}. ${session.name}${dirInfo}`);
  });

  // Read user input using readline/promises
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const answer = await rl.question('\nSelect session (number or name): ');
    rl.close();

    const num = Number.parseInt(answer, 10);
    let sessionName: string;

    if (!Number.isNaN(num) && num >= 1 && num <= sessions.length) {
      const entry = sessions[num - 1];
      sessionName = entry ? entry.name : answer.trim();
    } else {
      sessionName = answer.trim();
    }

    if (!sessionName) {
      return;
    }

    return attachToSession(sessionName);
  } catch {
    // User cancelled (Ctrl+C)
    rl.close();
    return;
  }
}

async function attachToSession(name: string): Promise<number> {
  // Check if tmux is installed
  if (!isTmuxInstalled()) {
    throw new CliError('tmux is not installed');
  }

  return attachToTmuxSession(name);
}
