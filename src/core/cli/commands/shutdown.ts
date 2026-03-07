import { isDaemonRunning, shutdownDaemon } from '@/core/client/index.js';

export interface ShutdownOptions {
  config?: string;
  stopSessions?: boolean;
  killTmux?: boolean;
}

export async function shutdownCommand(options: ShutdownOptions): Promise<void> {
  const running = await isDaemonRunning();

  if (!running) {
    return;
  }

  if (options.stopSessions && options.killTmux) {
  } else if (options.stopSessions) {
  } else {
  }

  await shutdownDaemon({
    stopSessions: options.stopSessions,
    killTmux: options.killTmux
  });
}
