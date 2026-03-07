/**
 * Shared utilities for portal HTML generation
 */

/**
 * Escape HTML special characters to prevent XSS
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate PWA meta tags and links
 */
export function generatePwaHead(basePath: string): string {
  return `
  <meta name="theme-color" content="#00d9ff">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="bunterm">
  <link rel="manifest" href="${basePath}/manifest.json">
  <link rel="apple-touch-icon" href="${basePath}/icon-192.png">
  <link rel="icon" type="image/svg+xml" href="${basePath}/icon.svg">`;
}

/**
 * Generate Service Worker registration script
 */
export function generateSwRegistration(basePath: string): string {
  return `
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('${basePath}/sw.js')
        .catch(err => console.warn('SW registration failed:', err));
    }
  </script>`;
}

/**
 * Common CSS styles for portal pages
 */
export const portalStyles = `
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
    }
    h1 {
      color: #00d9ff;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: #888;
      margin-bottom: 2rem;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .session {
      margin: 0.5rem 0;
    }
    .session a {
      display: block;
      padding: 1rem;
      background: #16213e;
      border-radius: 8px;
      text-decoration: none;
      color: #eee;
      transition: background 0.2s, transform 0.1s;
    }
    .session a:hover {
      background: #1f3460;
      transform: translateX(4px);
    }
    .name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #00d9ff;
    }
    .info {
      display: block;
      font-size: 0.85rem;
      color: #888;
      margin-top: 0.25rem;
    }
    .no-sessions {
      color: #888;
      padding: 2rem;
      text-align: center;
      background: #16213e;
      border-radius: 8px;
    }
    code {
      background: #0f0f23;
      padding: 0.2rem 0.4rem;
      border-radius: 4px;
      font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
    }`;

/**
 * Directory browser specific styles
 */
export const directoryBrowserStyles = `
    .new-session-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #00d9ff;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
      margin-top: 1rem;
    }
    .new-session-btn:hover {
      background: #00b8d9;
      transform: translateY(-2px);
    }
    .new-session-btn:disabled {
      background: #555;
      cursor: not-allowed;
      transform: none;
    }
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.8);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal {
      background: #16213e;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    }
    .modal-header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #2a3f5f;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      color: #00d9ff;
    }
    .modal-close {
      background: none;
      border: none;
      color: #888;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .modal-close:hover {
      color: #fff;
    }
    .modal-body {
      padding: 1rem 1.5rem;
      overflow-y: auto;
      flex: 1;
    }
    .modal-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid #2a3f5f;
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .base-selector {
      margin-bottom: 1rem;
    }
    .base-selector label {
      display: block;
      margin-bottom: 0.5rem;
      color: #888;
      font-size: 0.9rem;
    }
    .base-selector select {
      width: 100%;
      padding: 0.75rem;
      background: #0f0f23;
      border: 1px solid #2a3f5f;
      border-radius: 6px;
      color: #eee;
      font-size: 1rem;
    }
    .base-selector select:focus {
      outline: none;
      border-color: #00d9ff;
    }
    .directory-list {
      list-style: none;
      padding: 0;
      margin: 0;
      border: 1px solid #2a3f5f;
      border-radius: 6px;
      max-height: 300px;
      overflow-y: auto;
    }
    .directory-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #2a3f5f;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: background 0.1s;
    }
    .directory-item:last-child {
      border-bottom: none;
    }
    .directory-item:hover {
      background: #1f3460;
    }
    .directory-item.selected {
      background: #1f3460;
      border-left: 3px solid #00d9ff;
    }
    .directory-item .icon {
      color: #00d9ff;
    }
    .directory-item .name {
      flex: 1;
    }
    .directory-item .expand {
      color: #888;
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      margin-bottom: 0.75rem;
      font-size: 0.9rem;
      flex-wrap: wrap;
    }
    .breadcrumb-item {
      color: #00d9ff;
      cursor: pointer;
    }
    .breadcrumb-item:hover {
      text-decoration: underline;
    }
    .breadcrumb-separator {
      color: #888;
    }
    .selected-path {
      margin-top: 1rem;
      padding: 0.75rem;
      background: #0f0f23;
      border-radius: 6px;
      font-family: "SF Mono", Monaco, "Cascadia Code", monospace;
      font-size: 0.9rem;
      color: #00d9ff;
    }
    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-primary {
      background: #00d9ff;
      color: #1a1a2e;
      font-weight: 600;
    }
    .btn-primary:hover {
      background: #00b8d9;
    }
    .btn-primary:disabled {
      background: #555;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: #2a3f5f;
      color: #eee;
    }
    .btn-secondary:hover {
      background: #3a5080;
    }
    .loading-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #888;
      border-top-color: #00d9ff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .empty-message {
      padding: 2rem;
      text-align: center;
      color: #888;
    }`;
