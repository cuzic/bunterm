import { startSession as apiStartSession, ensureDaemon } from '@/core/client/index.js';
import { getFullPath, loadConfig } from '@/core/config/config.js';
import { attachSession } from '@/tmux.js';
import { getErrorMessage } from '@/utils/errors.js';

export interface UpOptions {
  name?: string;
  config?: string;
  attach?: boolean;
  detach?: boolean;
}

export async function upCommand(options: UpOptions): Promise<void> {
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

    const fullPath = getFullPath(config, session.path);
    const url = `http://localhost:${config.daemon_port}${fullPath}/`;
    console.log(`Session started: ${session.name}`);
    console.log(`URL: ${url}`);

    if (shouldAttach) {
      await attachSession(session.name);
    }
  } catch (error) {
    const message = getErrorMessage(error);
    if (message.includes('already running')) {
      console.log(`Session '${name}' is already running.`);
      if (shouldAttach) {
        await attachSession(name);
      }
      return;
    }
    console.error(`Failed to start session: ${message}`);
    process.exit(1);
  }
}
