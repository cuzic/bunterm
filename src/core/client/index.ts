// Re-export all from daemon-client

export {
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
  sendClipboard,
  startSession,
  stopSession
} from './eden-client.js';
