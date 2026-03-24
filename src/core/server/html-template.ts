/**
 * Native Terminal HTML Template
 *
 * Generates complete HTML pages for native terminal sessions.
 * Unlike legacy sessions, this serves xterm.js directly.
 */

import type { Config } from '@/core/config/types.js';
import { terminalUiStyles } from '@/core/server/terminal-ui/styles.js';
import { onboardingHtml, terminalUiHtml } from '@/core/server/terminal-ui/template.js';

export interface NativeTerminalHtmlOptions {
  /** Session name */
  sessionName: string;
  /** Base path (e.g., /bunterm) */
  basePath: string;
  /** Session path (e.g., /bunterm/my-session) */
  sessionPath: string;
  /** Configuration */
  config: Config;
  /** Whether this is a shared (read-only) view */
  isShared?: boolean;
  /** Page title override */
  title?: string;
  /** Current working directory of the session */
  cwd?: string;
}

/**
 * Generate the complete HTML page for a native terminal session
 */
export function generateNativeTerminalHtml(options: NativeTerminalHtmlOptions): string {
  const {
    sessionName,
    basePath,
    sessionPath,
    config,
    isShared = false,
    title = `${sessionName} - bunterm`,
    cwd = ''
  } = options;

  const wsPath = `${sessionPath}/ws`;

  // Terminal UI config as JSON
  const terminalUiConfig = JSON.stringify({
    ...config.terminal_ui,
    base_path: basePath,
    sessionName,
    sessionPath,
    isShared,
    isNativeTerminal: true,
    cwd
  });

  // Notification config for push notifications
  const notificationConfig = JSON.stringify({
    enabled: config.notifications.enabled,
    bell_notification: config.notifications.bell_notification
  });

  // Preview config
  const previewConfig = JSON.stringify({
    enabled: config.preview.enabled,
    defaultWidth: config.preview.default_width
  });

  // Check if AI chat is enabled (optional config)
  const aiChatEnabled = config.ai_chat?.enabled !== false;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#1e1e1e">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="${basePath}/favicon.ico" type="image/x-icon">
  <link rel="manifest" href="${basePath}/manifest.json">
  <link rel="stylesheet" href="${basePath}/xterm.css">
  <style>
    /* Base styles */
    * {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
    }
    #terminal {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .xterm {
      height: 100%;
      padding: 2px 0;
      box-sizing: border-box;
    }
    .xterm-viewport {
      overflow-x: hidden !important;
    }
    /* Loading indicator */
    #loading {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #888;
      font-size: 14px;
    }
    #loading.hidden {
      display: none;
    }
    /* Error message */
    #error {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #f44336;
      font-size: 14px;
      text-align: center;
      padding: 20px;
    }
    #error.hidden {
      display: none;
    }
    /* AI Chat toggle button */
    #ai-chat-toggle {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 48px;
      height: 48px;
      font-size: 24px;
      background-color: #3a86ff;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #ai-chat-toggle:hover {
      background-color: #2a76ef;
    }
    /* Terminal UI styles */
    ${terminalUiStyles}
  </style>
</head>
<body>
  <div id="terminal"></div>
  <div id="loading">Connecting...</div>
  <div id="error" class="hidden"></div>
  ${aiChatEnabled ? '<div id="ai-chat-app"></div>' : ''}

  <!-- Terminal UI -->
  ${terminalUiHtml}
  ${onboardingHtml.replace('id="tui-onboarding"', 'id="tui-onboarding" style="display:none"')}

  <!-- Configuration (must be before terminal-ui.js) -->
  <script>
    // Configuration for terminal-ui.js
    window.__TERMINAL_UI_CONFIG__ = ${terminalUiConfig};
    window.__BUNTERM_CONFIG__ = window.__TERMINAL_UI_CONFIG__;
    window.__NOTIFICATION_CONFIG__ = ${notificationConfig};
    window.__PREVIEW_CONFIG__ = ${previewConfig};
  </script>

  <!-- Scripts -->
  <script src="${basePath}/xterm-bundle.js"></script>
  <script src="${basePath}/terminal-client.js"></script>
  <script src="${basePath}/terminal-ui.js"></script>
  ${aiChatEnabled ? `<script src="${basePath}/ai-chat.js"></script>` : ''}

  <script>
    (function() {
      'use strict';

      // Register Service Worker for PWA
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('${basePath}/sw.js')
          .then(function(registration) {
            console.log('[PWA] Service Worker registered:', registration.scope);
          })
          .catch(function(error) {
            console.warn('[PWA] Service Worker registration failed:', error);
          });
      }

      var config = window.__TERMINAL_UI_CONFIG__;

      // Determine WebSocket URL
      var loc = window.location;
      var wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      var wsUrl = wsProtocol + '//' + loc.host + '${wsPath}';

      // Create terminal client
      var client = new window.TerminalClient({
        wsUrl: wsUrl,
        container: document.getElementById('terminal'),
        fontSize: config.font_size_default_pc || 14,
        scrollback: ${config.native_terminal.scrollback},
        autoReconnect: true,
        reconnectDelay: config.reconnect_interval || 2000,
        maxReconnectAttempts: config.reconnect_retries || 3,
        // Path link options
        sessionName: ${JSON.stringify(sessionName)},
        basePath: ${JSON.stringify(basePath)},
        cwd: config.cwd || '',
        enablePathLinks: true
      });

      // Connect
      var loadingEl = document.getElementById('loading');
      var errorEl = document.getElementById('error');

      client.connect()
        .then(function() {
          loadingEl.classList.add('hidden');
          client.focus();

          // Notify terminal-ui.js that the terminal is ready
          if (window.initTerminalUi) {
            window.initTerminalUi();
          }
        })
        .catch(function(error) {
          loadingEl.classList.add('hidden');
          errorEl.textContent = 'Connection failed: ' + error.message;
          errorEl.classList.remove('hidden');
        });

      // Handle page visibility for reconnection
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible' && !client.isConnected) {
          client.connect().catch(function() {});
        }
      });

      // Store client globally for debugging
      window.__TERMINAL_CLIENT__ = client;
    })();
  </script>
</body>
</html>`;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
