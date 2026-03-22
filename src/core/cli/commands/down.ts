/**
 * Down command - Stop session for current directory
 */

import { ensureDaemon, getSessions, shutdownDaemon, stopSession } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { requireSessionForCwd } from '@/core/cli/helpers/session-resolver.js';
import { CliError } from '@/utils/errors.js';

export interface DownOptions {
  config?: string;
  killTmux?: boolean;
}

export async function downCommand(options: DownOptions): Promise<void> {
  const config = loadConfig(options.config);

  // Ensure daemon is running
  await ensureDaemon(options.config, config.daemon_manager);

  // Find session for current directory
  const session = await requireSessionForCwd(config);

  try {
    await stopSession(config, session.name, { killTmux: options.killTmux });

    if (options.killTmux) {
      console.log(`Session '${session.name}' stopped and tmux session killed`);
    } else {
      console.log(`Session '${session.name}' stopped`);
    }

    // Check if there are any remaining sessions
    const remainingSessions = await getSessions(config);
    if (remainingSessions.length === 0) {
      await shutdownDaemon();
      console.log('Daemon stopped (no remaining sessions)');
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw CliError.from(error, 'Failed to stop session');
  }
}
