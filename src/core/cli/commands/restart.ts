import { isDaemonRunning, restartDaemon } from '@/core/client/index.js';

export interface RestartOptions {
  config?: string;
}

export async function restartCommand(options: RestartOptions): Promise<void> {
  const wasRunning = await isDaemonRunning();

  if (wasRunning) {
  } else {
  }

  try {
    await restartDaemon({ configPath: options.config });
  } catch (_err) {
    process.exit(1);
  }
}
