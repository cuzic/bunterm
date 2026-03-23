/**
 * Debug Panel
 *
 * Captures console.log output and displays it in a floating panel.
 * Useful for debugging on mobile devices where browser console is hard to access.
 *
 * Usage:
 *   DebugPanel.enable(); // Start capturing logs
 *   DebugPanel.disable(); // Stop and remove panel
 *
 * Or via URL parameter: ?debug=1
 */

export class DebugPanel {
  private static panel: HTMLElement | null = null;
  private static logContainer: HTMLElement | null = null;
  private static originalLog: typeof console.log | null = null;
  private static logs: string[] = [];
  private static maxLogs = 100;

  /**
   * Check if debug mode is enabled via URL parameter
   */
  static isEnabled(): boolean {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  }

  /**
   * Initialize debug panel if enabled
   */
  static init(): void {
    if (DebugPanel.isEnabled()) {
      DebugPanel.enable();
    }
  }

  /**
   * Enable debug panel and start capturing logs
   */
  static enable(): void {
    if (DebugPanel.panel) {
      return;
    }

    // Create panel
    DebugPanel.panel = document.createElement('div');
    DebugPanel.panel.id = 'debug-panel';
    const debugHeader = document.createElement('div');
    debugHeader.id = 'debug-header';

    const headerLabel = document.createElement('span');
    headerLabel.textContent = 'Debug Console';
    debugHeader.appendChild(headerLabel);

    const actions = document.createElement('div');
    actions.id = 'debug-actions';

    for (const [id, title, text] of [
      ['debug-copy', 'Copy logs', '📋'],
      ['debug-clear', 'Clear logs', '🗑️'],
      ['debug-close', 'Close', '×']
    ] as const) {
      const btn = document.createElement('button');
      btn.id = id;
      btn.title = title;
      btn.textContent = text;
      actions.appendChild(btn);
    }
    debugHeader.appendChild(actions);

    const logs = document.createElement('div');
    logs.id = 'debug-logs';

    DebugPanel.panel.appendChild(debugHeader);
    DebugPanel.panel.appendChild(logs);

    // Add styles
    const style = document.createElement('style');
    style.id = 'debug-panel-styles';
    style.textContent = `
      #debug-panel {
        position: fixed;
        bottom: 80px;
        left: 8px;
        right: 8px;
        max-height: 40vh;
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid #444;
        border-radius: 8px;
        z-index: 99999;
        font-family: monospace;
        font-size: 11px;
        color: #0f0;
        display: flex;
        flex-direction: column;
      }
      #debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: #333;
        border-radius: 8px 8px 0 0;
        border-bottom: 1px solid #444;
      }
      #debug-header span {
        font-weight: bold;
        color: #fff;
      }
      #debug-actions {
        display: flex;
        gap: 4px;
      }
      #debug-actions button {
        background: #555;
        border: none;
        color: #fff;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      #debug-actions button:active {
        background: #777;
      }
      #debug-logs {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        max-height: 35vh;
      }
      .debug-log {
        padding: 2px 0;
        border-bottom: 1px solid #333;
        word-wrap: break-word;
        white-space: pre-wrap;
      }
      .debug-log:last-child {
        border-bottom: none;
      }
      .debug-log-time {
        color: #888;
        margin-right: 8px;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(DebugPanel.panel);

    DebugPanel.logContainer = DebugPanel.panel.querySelector('#debug-logs');

    // Event handlers
    DebugPanel.panel
      .querySelector('#debug-copy')
      ?.addEventListener('click', () => DebugPanel.copyLogs());
    DebugPanel.panel
      .querySelector('#debug-clear')
      ?.addEventListener('click', () => DebugPanel.clearLogs());
    DebugPanel.panel
      .querySelector('#debug-close')
      ?.addEventListener('click', () => DebugPanel.disable());

    // Override console.log
    DebugPanel.originalLog = console.log;
    console.log = (...args: unknown[]) => {
      DebugPanel.addLog(args);
      DebugPanel.originalLog?.apply(console, args);
    };

    DebugPanel.addLog(['[DebugPanel] Enabled']);
  }

  /**
   * Disable debug panel and restore console.log
   */
  static disable(): void {
    if (DebugPanel.originalLog) {
      console.log = DebugPanel.originalLog;
      DebugPanel.originalLog = null;
    }

    DebugPanel.panel?.remove();
    DebugPanel.panel = null;
    DebugPanel.logContainer = null;

    document.getElementById('debug-panel-styles')?.remove();
  }

  /**
   * Add a log entry
   */
  private static addLog(args: unknown[]): void {
    const time = new Date().toLocaleTimeString('ja-JP', { hour12: false });
    const message = args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    const logEntry = `[${time}] ${message}`;
    DebugPanel.logs.push(logEntry);

    // Trim old logs
    if (DebugPanel.logs.length > DebugPanel.maxLogs) {
      DebugPanel.logs = DebugPanel.logs.slice(-DebugPanel.maxLogs);
    }

    // Update UI
    if (DebugPanel.logContainer) {
      const div = document.createElement('div');
      div.className = 'debug-log';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'debug-log-time';
      timeSpan.textContent = time;
      div.appendChild(timeSpan);

      div.appendChild(document.createTextNode(message));
      DebugPanel.logContainer.appendChild(div);

      // Auto-scroll to bottom
      DebugPanel.logContainer.scrollTop = DebugPanel.logContainer.scrollHeight;

      // Trim old DOM elements
      while (DebugPanel.logContainer.children.length > DebugPanel.maxLogs) {
        DebugPanel.logContainer.firstChild?.remove();
      }
    }
  }

  /**
   * Copy all logs to clipboard
   */
  private static copyLogs(): void {
    const text = DebugPanel.logs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      DebugPanel.originalLog?.('[DebugPanel] Logs copied to clipboard');
    });
  }

  /**
   * Clear all logs
   */
  private static clearLogs(): void {
    DebugPanel.logs = [];
    if (DebugPanel.logContainer) {
      DebugPanel.logContainer.innerHTML = '';
    }
  }
}
