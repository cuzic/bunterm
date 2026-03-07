import { getSessions, isDaemonRunning } from '@/core/client/index.js';
import { getFullPath, loadConfig } from '@/core/config/config.js';
import { handleCliError } from '@/utils/errors.js';

export interface ListOptions {
  config?: string;
  long?: boolean;
  url?: boolean;
}

export async function listCommand(options: ListOptions): Promise<void> {
  const config = loadConfig(options.config);

  if (!(await isDaemonRunning())) {
    // No sessions (daemon not running)
    return;
  }

  try {
    const sessions = await getSessions(config);

    for (const session of sessions) {
      if (options.url) {
        const fullPath = getFullPath(config, session.path);
        const _url = `http://localhost:${config.daemon_port}${fullPath}/`;
      } else if (options.long) {
      } else {
      }
    }
  } catch (error) {
    handleCliError('Failed to list sessions', error);
    process.exit(1);
  }
}
