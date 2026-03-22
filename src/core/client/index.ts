// Re-export all from daemon-client
export {
  type DaemonClientDeps,
  defaultDaemonClientDeps,
  setDaemonClientDeps,
  resetDaemonClientDeps,
  isDaemonRunning,
  ensureDaemon,
  shutdownDaemon,
  restartDaemon
} from './daemon-client.js';

// Re-export all from api-client
export {
  apiRequest,
  getStatus,
  getSessions,
  getTmuxSessions,
  startSession,
  stopSession,
  requestShutdown
} from './api-client.js';
export type { TmuxSessionResponse, TmuxSessionsResponse } from '@/core/config/types.js';
