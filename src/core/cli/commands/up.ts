/**
 * Up command - Start session for current directory
 */

import { spawnSync } from 'node:child_process';
import { buildSessionUrl } from '@/core/cli/helpers/url-builder.js';
import { parseCliOptions, type UpOptions, UpOptionsSchema } from '@/core/cli/schemas.js';
import { startSession as apiStartSession, ensureDaemon, getSessions } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { sanitizeName } from '@/utils/command-template.js';
import { CliError, getErrorMessage } from '@/utils/errors.js';

export type { UpOptions };

/**
 * Check if the config command template uses tmux.
 */
function isTmuxCommand(command: string | string[] | undefined): boolean {
  if (!command) return false;
  const cmd = Array.isArray(command) ? command[0] : command.split(/\s+/)[0];
  return cmd === 'tmux';
}

export async function upCommand(rawOptions: unknown): Promise<number | undefined> {
  const options = parseCliOptions(rawOptions, UpOptionsSchema, 'up');
  const config = loadConfig(options.config);
  const dir = process.cwd();
  const name = options.name ?? dir.split('/').pop() ?? 'default';

  // Ensure daemon is running
  await ensureDaemon(options.config, config.daemon_manager);

  let sessionName: string | undefined;

  try {
    const session = await apiStartSession(config, {
      name,
      dir
    });

    sessionName = session.name;
    const url = buildSessionUrl(config, session.path);
    console.log(`Session started: ${session.name}`);
    console.log(`URL: ${url}`);
  } catch (error) {
    const message = getErrorMessage(error);
    // Handle "already exists" or "already running" errors
    if (message.includes('already exists') || message.includes('already running')) {
      // Get existing session info
      const sessions = await getSessions(config);
      const existing = sessions.find((s) => s.name === name);

      if (existing) {
        sessionName = existing.name;
        const url = buildSessionUrl(config, existing.path);
        console.log(`Session '${name}' is already running.`);
        console.log(`URL: ${url}`);
      } else {
        console.log(`Session '${name}' is already running.`);
        return;
      }
    } else {
      throw new CliError(`Failed to start session: ${message}`);
    }
  }

  // Attach to tmux session if config command uses tmux
  const shouldAttach = options.attach ?? config.attach_on_up;
  if (shouldAttach && sessionName && isTmuxCommand(config.command)) {
    const tmuxName = sanitizeName(sessionName);
    const result = spawnSync('tmux', ['attach-session', '-t', tmuxName], {
      stdio: 'inherit'
    });
    return result.status ?? 0;
  }

  return undefined;
}
