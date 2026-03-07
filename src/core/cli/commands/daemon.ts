import { startSession as apiStartSession, isDaemonRunning } from '@/core/client/index.js';
import { getFullPath, loadConfig } from '@/core/config/config.js';
import type { Config, SessionDefinition } from '@/core/config/types.js';
import { startDaemon } from '@/core/daemon/index.js';
import { handleCliError } from '@/utils/errors.js';
import { checkbox } from '@inquirer/prompts';

export interface DaemonOptions {
  foreground?: boolean;
  config?: string;
  sessions?: boolean;
  select?: boolean;
}

/**
 * Start multiple sessions from definitions
 */
async function startSessions(config: Config, sessionDefs: SessionDefinition[]): Promise<void> {
  for (const sessionDef of sessionDefs) {
    try {
      const session = await apiStartSession(config, {
        name: sessionDef.name,
        dir: sessionDef.dir,
        path: sessionDef.path
      });

      const fullPath = getFullPath(config, session.path);
      console.log(`Started session: ${session.name} (${fullPath})`);
    } catch (error) {
      handleCliError(`Failed to start "${sessionDef.name}"`, error);
    }
  }
}

/**
 * Start all predefined sessions
 */
async function startAllSessions(config: Config): Promise<void> {
  const sessions = config.sessions;
  if (sessions.length === 0) {
    return;
  }
  await startSessions(config, sessions);
}

/**
 * Interactive session selection and start
 */
async function selectAndStartSessions(config: Config): Promise<void> {
  const sessions = config.sessions;
  if (sessions.length === 0) {
    return;
  }

  const choices = sessions.map((s) => ({
    name: `${s.name} (${s.dir})`,
    value: s.name
  }));

  const selected = await checkbox({
    message: 'Select sessions to start:',
    choices
  });

  if (selected.length === 0) {
    return;
  }

  const selectedDefs = sessions.filter((s) => selected.includes(s.name));
  await startSessions(config, selectedDefs);
}

export async function daemonCommand(options: DaemonOptions): Promise<void> {
  // Check if already running
  if (await isDaemonRunning()) {
    process.exit(1);
  }

  const config = loadConfig(options.config);

  if (options.foreground) {
    // Run in foreground (sessions not supported in foreground mode)
    if (options.sessions || options.select) {
    }
    await startDaemon({
      configPath: options.config,
      foreground: true
    });
  } else {
    // Import and use ensureDaemon to start in background
    const { ensureDaemon } = await import('@/core/client/index.js');
    await ensureDaemon(options.config);

    // Start sessions if requested
    if (options.select) {
      await selectAndStartSessions(config);
    } else if (options.sessions) {
      await startAllSessions(config);
    }
  }
}
