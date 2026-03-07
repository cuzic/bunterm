/**
 * Core Server Module
 *
 * Server infrastructure components for the daemon.
 */

// Session Manager
export {
  NativeSessionManager,
  type NativeSessionOptions,
  type NativeSessionState
} from './session-manager.js';

// WebSocket Handler
export {
  createNativeTerminalWebSocketHandlers,
  isNativeTerminalWebSocketPath,
  isNativeTerminalHtmlPath,
  type NativeTerminalWebSocketHandlerOptions,
  type AuthenticatedWebSocketData
} from './ws-handler.js';

// HTTP Handler
export { handleHttpRequest } from './http-handler.js';

// Portal
export { generatePortalHtml, generateJsonResponse } from './portal.js';

// PWA
export {
  generateManifest,
  getManifestJson,
  getServiceWorker,
  getIconSvg,
  getIconPng
} from './pwa.js';

// Portal Utils
export {
  portalStyles,
  directoryBrowserStyles,
  escapeHtml,
  generatePwaHead,
  generateSwRegistration
} from './portal-utils.js';
