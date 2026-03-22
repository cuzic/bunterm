/**
 * Up command - Start session for current directory
 */

import { startSession as apiStartSession, ensureDaemon, getSessions } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { buildSessionUrl } from '@/core/cli/helpers/url-builder.js';
import { type UpOptions, UpOptionsSchema, parseCliOptions } from '@/core/cli/schemas.js';
import { attachSession } from '@/tmux.js';
import { CliError, getErrorMessage } from '@/utils/errors.js';

export type { UpOptions };

export async function upCommand(rawOptions: unknown): Promise<void> {
  const options = parseCliOptions(rawOptions, UpOptionsSchema, 'up');
  const config = loadConfig(options.config);
  const dir = process.cwd();
  const name = options.name ?? dir.split('/').pop() ?? 'default';

  // Determine whether to attach
  const shouldAttach = options.detach ? false : (options.attach ?? config.auto_attach);

  // Ensure daemon is running
  await ensureDaemon(options.config, config.daemon_manager);

  try {
    const session = await apiStartSession(config, {
      name,
      dir
    });

    const url = buildSessionUrl(config, session.path);
    console.log(`Session started: ${session.name}`);
    console.log(`URL: ${url}`);

    if (shouldAttach) {
      await attachSession(session.name);
    }
  } catch (error) {
    const message = getErrorMessage(error);
    // Handle "already exists" or "already running" errors
    if (message.includes('already exists') || message.includes('already running')) {
      // Get existing session info
      const sessions = await getSessions(config);
      const existing = sessions.find((s) => s.name === name);

      if (existing) {
        const url = buildSessionUrl(config, existing.path);
        console.log(`Session '${name}' is already running.`);
        console.log(`URL: ${url}`);
      } else {
        console.log(`Session '${name}' is already running.`);
      }

      if (shouldAttach) {
        await attachSession(name);
      }
      return;
    }
    throw new CliError(`Failed to start session: ${message}`);
  }
}
