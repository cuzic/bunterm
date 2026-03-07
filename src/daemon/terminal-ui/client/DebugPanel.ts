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
    if (this.isEnabled()) {
      this.enable();
    }
  }

  /**
   * Enable debug panel and start capturing logs
   */
  static enable(): void {
    if (this.panel) return;

    // Create panel
    this.panel = document.createElement('div');
    this.panel.id = 'debug-panel';
    this.panel.innerHTML = `
      <div id="debug-header">
        <span>Debug Console</span>
        <div id="debug-actions">
          <button id="debug-copy" title="Copy logs">📋</button>
          <button id="debug-clear" title="Clear logs">🗑️</button>
          <button id="debug-close" title="Close">×</button>
        </div>
      </div>
      <div id="debug-logs"></div>
    `;

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
    document.body.appendChild(this.panel);

    this.logContainer = this.panel.querySelector('#debug-logs');

    // Event handlers
    this.panel.querySelector('#debug-copy')?.addEventListener('click', () => this.copyLogs());
    this.panel.querySelector('#debug-clear')?.addEventListener('click', () => this.clearLogs());
    this.panel.querySelector('#debug-close')?.addEventListener('click', () => this.disable());

    // Override console.log
    this.originalLog = console.log;
    console.log = (...args: unknown[]) => {
      this.addLog(args);
      this.originalLog?.apply(console, args);
    };

    this.addLog(['[DebugPanel] Enabled']);
  }

  /**
   * Disable debug panel and restore console.log
   */
  static disable(): void {
    if (this.originalLog) {
      console.log = this.originalLog;
      this.originalLog = null;
    }

    this.panel?.remove();
    this.panel = null;
    this.logContainer = null;

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
    this.logs.push(logEntry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Update UI
    if (this.logContainer) {
      const div = document.createElement('div');
      div.className = 'debug-log';
      div.innerHTML = `<span class="debug-log-time">${time}</span>${this.escapeHtml(message)}`;
      this.logContainer.appendChild(div);

      // Auto-scroll to bottom
      this.logContainer.scrollTop = this.logContainer.scrollHeight;

      // Trim old DOM elements
      while (this.logContainer.children.length > this.maxLogs) {
        this.logContainer.firstChild?.remove();
      }
    }
  }

  /**
   * Copy all logs to clipboard
   */
  private static copyLogs(): void {
    const text = this.logs.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.originalLog?.('[DebugPanel] Logs copied to clipboard');
    });
  }

  /**
   * Clear all logs
   */
  private static clearLogs(): void {
    this.logs = [];
    if (this.logContainer) {
      this.logContainer.innerHTML = '';
    }
  }

  /**
   * Escape HTML special characters
   */
  private static escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
