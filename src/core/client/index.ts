// Re-export all from daemon-client

export {
  type DaemonClientDeps,
  defaultDaemonClientDeps,
  ensureDaemon,
  isDaemonRunning,
  resetDaemonClientDeps,
  restartDaemon,
  setDaemonClientDeps,
  shutdownDaemon
} from './daemon-client.js';
// Re-export Eden client wrappers (type-safe, inferred from Elysia routes)
export {
  getSessions,
  getStatus,
  getTmuxSessions,
  requestShutdown,
  sendClipboard,
  startSession,
  stopSession
} from './eden-client.js';
