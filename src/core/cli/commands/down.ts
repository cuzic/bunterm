import { ensureDaemon, getSessions, shutdownDaemon, stopSession } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { handleCliError } from '@/utils/errors.js';

export interface DownOptions {
  config?: string;
  killTmux?: boolean;
}

export async function downCommand(options: DownOptions): Promise<void> {
  const config = loadConfig(options.config);
  const dir = process.cwd();

  // Ensure daemon is running
  await ensureDaemon(options.config, config.daemon_manager);

  // Find session for current directory
  const sessions = await getSessions(config);
  const session = sessions.find((s) => s.dir === dir);

  if (!session) {
    if (sessions.length > 0) {
      for (const _s of sessions) {
      }
    } else {
    }
    process.exit(1);
  }

  try {
    await stopSession(config, session.name, { killTmux: options.killTmux });
    if (options.killTmux) {
    } else {
    }

    // Check if there are any remaining sessions
    const remainingSessions = await getSessions(config);
    if (remainingSessions.length === 0) {
      await shutdownDaemon();
    }
  } catch (error) {
    handleCliError('Failed to stop session', error);
    process.exit(1);
  }
}
