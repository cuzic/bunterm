/**
 * Terminal UI Module
 *
 * Provides enhanced UI for ttyd sessions with:
 * - IME input support for Japanese
 * - Font size zoom controls
 * - Copy/paste functionality
 * - Touch gesture support
 * - Modifier key buttons (Ctrl, Alt, Shift)
 * - Scrollback search
 * - File transfer
 * - Push notifications
 * - HTML preview
 * - Command snippets
 * - Sentry error monitoring (client-side)
 */

import {
  DEFAULT_PREVIEW_CONFIG,
  DEFAULT_SENTRY_CONFIG,
  DEFAULT_TERMINAL_UI_CONFIG,
  type SentryConfig,
  type TerminalUiConfig
} from '@/config/types.js';
import {
  AUTO_RUN_KEY,
  CLIPBOARD_HISTORY_KEY,
  ONBOARDING_SHOWN_KEY,
  SNIPPETS_KEY,
  STORAGE_KEY
} from './config.js';
import { terminalUiStyles } from './styles.js';
import { onboardingHtml, terminalUiHtml } from './template.js';

// Re-export config constants (localStorage keys only)
export { AUTO_RUN_KEY, CLIPBOARD_HISTORY_KEY, ONBOARDING_SHOWN_KEY, SNIPPETS_KEY, STORAGE_KEY };

// Re-export for direct access
export { onboardingHtml, terminalUiHtml, terminalUiStyles };

// Re-export type and default config
export { DEFAULT_SENTRY_CONFIG, DEFAULT_TERMINAL_UI_CONFIG };
export type { SentryConfig, TerminalUiConfig };

/**
 * WebSocket interception script
 *
 * This must run BEFORE ttyd's script to intercept WebSocket creation.
 * Stores captured WebSocket in window.__TTYD_WS__ for later use.
 */
const wsInterceptScript = `
<script>
(function() {
  var OriginalWebSocket = window.WebSocket;
  window.WebSocket = function(url, protocols) {
    var socket = new OriginalWebSocket(url, protocols);
    if (url && url.indexOf('/ws') !== -1) {
      window.__TTYD_WS__ = socket;
      // Monitor WebSocket close for reconnection
      socket.addEventListener('close', function(event) {
        // Only trigger reconnection for unexpected closes (not normal closure)
        // Code 1000 = normal closure, 1001 = going away (page unload)
        if (event.code !== 1000 && event.code !== 1001) {
          window.dispatchEvent(new CustomEvent('ttyd-ws-close', { detail: { code: event.code, reason: event.reason } }));
        }
      });
    }
    return socket;
  };
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  window.WebSocket.OPEN = OriginalWebSocket.OPEN;
  window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
})();
</script>
`;

/**
 * Extract Sentry key from DSN for CDN loader URL
 *
 * DSN format: https://<key>@<org>.ingest.sentry.io/<project>
 * Returns the key portion (username from URL)
 */
function extractSentryKey(dsn: string): string {
  try {
    return new URL(dsn).username || '';
  } catch {
    return '';
  }
}

/**
 * Generate Sentry CDN script for client-side error monitoring
 */
function generateSentryScript(sentryConfig: SentryConfig): string {
  if (!sentryConfig.enabled || !sentryConfig.dsn) {
    return '';
  }

  const sentryKey = extractSentryKey(sentryConfig.dsn);
  if (!sentryKey) {
    return '';
  }

  return `
<script src="https://js.sentry-cdn.com/${sentryKey}.min.js" crossorigin="anonymous"></script>
<script>
Sentry.onLoad(function() {
  Sentry.init({
    environment: ${JSON.stringify(sentryConfig.environment)},
    sampleRate: ${sentryConfig.sample_rate}
  });
});
</script>`;
}

/** Options for terminal UI injection */
export interface InjectOptions {
  sentryConfig?: SentryConfig;
  previewAllowedExtensions?: string[];
}

/**
 * Inject terminal UI into HTML response
 *
 * Injects:
 * - WebSocket interception script (in <head> BEFORE ttyd's scripts)
 * - Sentry CDN loader (if configured)
 * - CSS styles (inline for FOUC avoidance)
 * - HTML structure
 * - Onboarding tooltip (hidden by default)
 * - Config as global variable
 * - Script tag referencing external terminal-ui.js (static file)
 *
 * @param html - Original HTML content
 * @param basePath - Base path for the ttyd-mux routes (e.g., "/ttyd-mux")
 * @param config - Terminal UI configuration from config.yaml
 * @param options - Additional options (sentry, preview extensions)
 * @returns Modified HTML with terminal UI injected
 */
export function injectTerminalUi(
  html: string,
  basePath: string,
  config: TerminalUiConfig = DEFAULT_TERMINAL_UI_CONFIG,
  options: InjectOptions = {}
): string {
  const {
    sentryConfig = DEFAULT_SENTRY_CONFIG,
    previewAllowedExtensions = DEFAULT_PREVIEW_CONFIG.allowed_extensions
  } = options;

  // Prepare client-side Sentry config (subset of server config)
  const clientSentryConfig = sentryConfig.enabled
    ? {
        enabled: true,
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        sample_rate: sentryConfig.sample_rate
      }
    : undefined;

  // Merge basePath, sentry config, and preview extensions into config for client-side use
  const clientConfig = {
    ...config,
    base_path: basePath,
    preview_allowed_extensions: previewAllowedExtensions,
    sentry: clientSentryConfig
  };
  const configScript = `<script>window.__TERMINAL_UI_CONFIG__ = ${JSON.stringify(clientConfig)};</script>`;

  // Generate Sentry CDN script
  const sentryScript = generateSentryScript(sentryConfig);

  // Inject WebSocket interception and Sentry in <head> BEFORE any other scripts
  const modifiedHtml = html.replace('<head>', `<head>${wsInterceptScript}${sentryScript}`);

  const bodyInjection = `
<style>${terminalUiStyles}</style>
${terminalUiHtml}
${onboardingHtml.replace('id="tui-onboarding"', 'id="tui-onboarding" style="display:none"')}
${configScript}
<script src="${basePath}/terminal-ui.js"></script>
`;
  return modifiedHtml.replace('</body>', `${bodyInjection}</body>`);
}
