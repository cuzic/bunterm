import { guardDaemon } from '@/core/cli/helpers/daemon-guard.js';
import { buildSessionUrl } from '@/core/cli/helpers/url-builder.js';
import { getSessions } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import type { Config } from '@/core/config/types.js';
import { CliError } from '@/utils/errors.js';

export interface ListOptions {
  config?: string;
  long?: boolean;
  url?: boolean;
  json?: boolean;
}

interface SessionListItem {
  name: string;
  dir: string;
  path: string;
  url: string;
}

// === Types ===

type BuntermSession = Awaited<ReturnType<typeof getSessions>>[0];

// === Transformation ===

function buildSessionList(sessions: BuntermSession[], config: Config): SessionListItem[] {
  return sessions.map((session) => ({
    name: session.name,
    dir: session.dir,
    path: session.path,
    url: buildSessionUrl(config, session.path)
  }));
}

// === Output ===

function outputText(sessions: SessionListItem[], options: Pick<ListOptions, 'long' | 'url'>): void {
  if (sessions.length === 0) {
    console.log('No active sessions.');
    console.log('Run "bunterm up" to start a session.');
    return;
  }

  for (const session of sessions) {
    if (options.url && session.url) {
      console.log(session.url);
    } else if (options.long) {
      console.log(`${session.name}\t${session.dir}\t${session.path}`);
    } else {
      console.log(session.name);
    }
  }
}

// === Command Entry Point ===

export async function listCommand(options: ListOptions): Promise<void> {
  const config = loadConfig(options.config);

  // Check daemon
  const guard = await guardDaemon({ json: options.json });
  if (!guard.running) {
    return;
  }

  try {
    const buntermSessions = await getSessions(config);
    const sessions = buildSessionList(buntermSessions, config);

    if (options.json) {
      console.log(JSON.stringify({ sessions, daemon: true }));
    } else {
      outputText(sessions, options);
    }
  } catch (error) {
    throw CliError.from(error, 'Failed to list sessions');
  }
}
