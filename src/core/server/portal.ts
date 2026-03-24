import { getFullPath } from '@/core/config/config.js';
import type { Config, SessionState } from '@/core/config/types.js';
import {
  directoryBrowserStyles,
  escapeHtml,
  generatePwaHead,
  generateSwRegistration,
  portalStyles
} from './portal-utils.js';

/**
 * Generate auto-reload script for portal page
 * Reloads the page when the tab becomes visible to refresh session list
 */
function generateAutoReloadScript(): string {
  return `
  <script>
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        location.reload();
      }
    });
  </script>`;
}

/**
 * Generate tmux sessions section HTML
 */
function generateTmuxSessionsSection(): string {
  return `
  <div id="tmuxSessionsSection" class="tmux-section" style="display: none;">
    <div class="tmux-header">
      <span class="tmux-icon">&#128279;</span>
      <h2>tmux Sessions</h2>
    </div>
    <p class="tmux-subtitle">Connect to an existing tmux session</p>
    <ul id="tmuxSessionsList" class="tmux-sessions-list">
      <li class="loading-message">Loading tmux sessions...</li>
    </ul>
  </div>`;
}

/**
 * Generate tmux sessions styles
 */
function generateTmuxSessionsStyles(): string {
  return `
    .tmux-section {
      margin-bottom: 2rem;
      padding: 1.5rem;
      background: linear-gradient(135deg, #16213e 0%, #1a2744 100%);
      border: 1px solid #2a4a6e;
      border-radius: 12px;
    }
    .tmux-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .tmux-icon {
      font-size: 1.3rem;
    }
    .tmux-section h2 {
      font-size: 1.3rem;
      color: #00d9ff;
      margin: 0;
    }
    .tmux-subtitle {
      font-size: 0.9rem;
      color: #888;
      margin: 0 0 1rem 0;
    }
    .tmux-sessions-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .tmux-sessions-list li {
      margin-bottom: 0.75rem;
    }
    .tmux-sessions-list li:last-child {
      margin-bottom: 0;
    }
    .tmux-sessions-list .loading-message,
    .tmux-sessions-list .empty-message {
      color: #888;
      font-style: italic;
      padding: 1rem;
      text-align: center;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
    }
    .tmux-session-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid #2a4a6e;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      transition: border-color 0.2s, background 0.2s, transform 0.1s;
    }
    .tmux-session-item:hover {
      border-color: #00d9ff;
      background: rgba(0, 217, 255, 0.1);
      transform: translateX(4px);
    }
    .tmux-session-info {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .tmux-session-name {
      font-weight: 600;
      font-size: 1.1rem;
      color: #fff;
    }
    .tmux-session-meta {
      font-size: 0.85rem;
      color: #888;
    }
    .tmux-session-meta .attached {
      color: #4caf50;
      font-weight: 500;
    }
    .tmux-connect-btn {
      background: #00d9ff;
      color: #000;
      border: none;
      border-radius: 6px;
      padding: 0.6rem 1.25rem;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }
    .tmux-connect-btn:hover {
      background: #00b8d4;
      transform: scale(1.05);
    }
    .tmux-connect-btn:disabled {
      background: #555;
      color: #888;
      cursor: not-allowed;
      transform: none;
    }
    /* Active sessions section */
    .active-sessions-section {
      margin-bottom: 1.5rem;
    }
    .section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .section-icon {
      font-size: 1.2rem;
    }
    .section-header h2 {
      font-size: 1.1rem;
      color: #888;
      margin: 0;
      font-weight: 500;
    }
    /* Mobile responsive styles */
    @media (max-width: 480px) {
      .tmux-section {
        padding: 1rem;
        margin-bottom: 1.5rem;
      }
      .tmux-section h2 {
        font-size: 1.1rem;
      }
      .tmux-session-item {
        flex-direction: column;
        align-items: stretch;
        gap: 0.75rem;
        padding: 0.875rem 1rem;
      }
      .tmux-session-info {
        text-align: left;
      }
      .tmux-session-name {
        font-size: 1rem;
        word-break: break-word;
      }
      .tmux-connect-btn {
        width: 100%;
        padding: 0.75rem 1rem;
        min-height: 44px;
        font-size: 1rem;
      }
      .section-header h2 {
        font-size: 1rem;
      }
    }
  `;
}

/**
 * Generate tmux sessions JavaScript
 */
function generateTmuxSessionsScript(basePath: string): string {
  return `
  <script>
    const TMUX_API_BASE = '${basePath}';

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function escapeJs(str) {
      return str.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
    }

    async function loadTmuxSessions() {
      const section = document.getElementById('tmuxSessionsSection');
      const list = document.getElementById('tmuxSessionsList');

      try {
        const res = await fetch(TMUX_API_BASE + '/api/tmux/sessions');
        const data = await res.json();

        if (!data.installed) {
          // tmux not installed, hide the section
          section.style.display = 'none';
          return;
        }

        if (data.sessions.length === 0) {
          list.innerHTML = '<li class="empty-message">No tmux sessions available</li>';
          section.style.display = 'block';
          return;
        }

        list.innerHTML = data.sessions.map(function(s) {
          const meta = s.windows + ' window' + (s.windows !== 1 ? 's' : '') +
            (s.attached ? ' • <span class="attached">attached</span>' : '');
          return '<li>' +
            '<div class="tmux-session-item">' +
            '<div class="tmux-session-info">' +
            '<span class="tmux-session-name">' + escapeHtml(s.name) + '</span>' +
            '<span class="tmux-session-meta">' + meta + '</span>' +
            '</div>' +
            '<button class="tmux-connect-btn" onclick="connectToTmux(\\'' + escapeJs(s.name) + '\\')">Connect</button>' +
            '</div>' +
            '</li>';
        }).join('');

        section.style.display = 'block';
      } catch (e) {
        console.error('Failed to load tmux sessions:', e);
        section.style.display = 'none';
      }
    }

    async function connectToTmux(tmuxSessionName) {
      const btn = event.target;
      btn.disabled = true;
      btn.textContent = 'Connecting...';

      try {
        // Check if there's an existing session for this tmux session
        const sessionsRes = await fetch(TMUX_API_BASE + '/api/sessions');
        const sessions = await sessionsRes.json();
        const existing = sessions.find(function(s) {
          return s.tmuxSession === tmuxSessionName;
        });

        if (existing) {
          // Navigate to existing session
          window.location.href = TMUX_API_BASE + '/' + encodeURIComponent(existing.name) + '/';
          return;
        }

        // Use the same name as tmux session
        const sessionName = tmuxSessionName;

        // Get tmux session's current working directory
        let dir = null;
        try {
          const cwdRes = await fetch(TMUX_API_BASE + '/api/tmux/sessions');
          const cwdData = await cwdRes.json();
          const sess = cwdData.sessions?.find(function(s) { return s.name === tmuxSessionName; });
          dir = sess?.cwd || null;
        } catch (e) {
          console.warn('Failed to get tmux session cwd:', e);
        }

        const res = await fetch(TMUX_API_BASE + '/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: sessionName,
            dir: dir,  // Use tmux session's cwd, or null to use server's cwd
            tmuxSession: tmuxSessionName
          })
        });

        const data = await res.json();

        if (!res.ok) {
          alert('Failed to connect: ' + (data.error || 'Unknown error'));
          btn.disabled = false;
          btn.textContent = 'Connect';
          return;
        }

        // Navigate to the session (use returned name, which may be different for existing sessions)
        window.location.href = TMUX_API_BASE + '/' + encodeURIComponent(data.name) + '/';
      } catch (e) {
        console.error('Failed to connect to tmux session:', e);
        alert('Failed to connect to tmux session');
        btn.disabled = false;
        btn.textContent = 'Connect';
      }
    }

    // Load tmux sessions on page load
    loadTmuxSessions();
  </script>`;
}

/**
 * Generate directory browser modal HTML
 */
function generateDirectoryBrowserModal(): string {
  return `
  <div id="dirBrowserModal" class="modal-overlay">
    <div class="modal">
      <div class="modal-header">
        <h2>New Session</h2>
        <button class="modal-close" onclick="closeDirBrowser()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="base-selector">
          <label for="baseDir">Base Directory</label>
          <select id="baseDir" onchange="onBaseDirChange()">
            <option value="">Loading...</option>
          </select>
        </div>
        <div id="breadcrumb" class="breadcrumb"></div>
        <ul id="dirList" class="directory-list">
          <li class="empty-message">Select a base directory</li>
        </ul>
        <div id="selectedPath" class="selected-path" style="display: none;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeDirBrowser()">Cancel</button>
        <button id="startSessionBtn" class="btn btn-primary" onclick="startSession()" disabled>Start Session</button>
      </div>
    </div>
  </div>`;
}

/**
 * Generate directory browser JavaScript
 */
function generateDirectoryBrowserScript(basePath: string): string {
  return `
  <script>
    const API_BASE = '${basePath}';
    let allowedDirs = [];
    let currentBaseIndex = -1;
    let currentPath = '';
    let selectedFullPath = '';

    async function openDirBrowser() {
      document.getElementById('dirBrowserModal').classList.add('active');
      await loadAllowedDirs();
    }

    function closeDirBrowser() {
      document.getElementById('dirBrowserModal').classList.remove('active');
      resetBrowser();
    }

    function resetBrowser() {
      currentBaseIndex = -1;
      currentPath = '';
      selectedFullPath = '';
      document.getElementById('baseDir').value = '';
      document.getElementById('dirList').innerHTML = '<li class="empty-message">Select a base directory</li>';
      document.getElementById('breadcrumb').innerHTML = '';
      document.getElementById('selectedPath').style.display = 'none';
      document.getElementById('startSessionBtn').disabled = true;
    }

    async function loadAllowedDirs() {
      try {
        const res = await fetch(API_BASE + '/api/directories');
        const data = await res.json();
        allowedDirs = data.directories || [];

        const select = document.getElementById('baseDir');
        select.innerHTML = '<option value="">Select a directory...</option>' +
          allowedDirs.map((d, i) => '<option value="' + i + '">' + escapeHtml(d.name) + '</option>').join('');
      } catch (e) {
        console.error('Failed to load directories:', e);
        document.getElementById('dirList').innerHTML = '<li class="empty-message">Failed to load directories</li>';
      }
    }

    async function onBaseDirChange() {
      const select = document.getElementById('baseDir');
      const index = parseInt(select.value, 10);

      if (isNaN(index) || index < 0) {
        resetBrowser();
        return;
      }

      currentBaseIndex = index;
      currentPath = '';
      await loadDirectories();
    }

    async function loadDirectories() {
      if (currentBaseIndex < 0) return;

      const dirList = document.getElementById('dirList');
      dirList.innerHTML = '<li class="empty-message"><span class="loading-spinner"></span> Loading...</li>';

      try {
        const url = API_BASE + '/api/directories/list?base=' + currentBaseIndex + '&path=' + encodeURIComponent(currentPath);
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok) {
          dirList.innerHTML = '<li class="empty-message">' + escapeHtml(data.error || 'Failed to load') + '</li>';
          return;
        }

        selectedFullPath = data.current;
        updateBreadcrumb();
        updateSelectedPath();

        if (data.directories.length === 0) {
          dirList.innerHTML = '<li class="empty-message">No subdirectories</li>';
        } else {
          dirList.innerHTML = data.directories.map(d =>
            '<li class="directory-item" onclick="navigateToDir(\\'' + escapeJs(d.path) + '\\')">' +
            '<span class="icon">&#128193;</span>' +
            '<span class="name">' + escapeHtml(d.name) + '</span>' +
            '<span class="expand">&#8250;</span>' +
            '</li>'
          ).join('');
        }
      } catch (e) {
        console.error('Failed to load directories:', e);
        dirList.innerHTML = '<li class="empty-message">Failed to load directories</li>';
      }
    }

    function navigateToDir(path) {
      currentPath = path;
      loadDirectories();
    }

    function navigateToBreadcrumb(index) {
      if (index < 0) {
        currentPath = '';
      } else {
        const parts = currentPath.split('/').filter(p => p);
        currentPath = parts.slice(0, index + 1).join('/');
      }
      loadDirectories();
    }

    function updateBreadcrumb() {
      const breadcrumb = document.getElementById('breadcrumb');
      const baseName = allowedDirs[currentBaseIndex]?.name || '';

      let html = '<span class="breadcrumb-item" onclick="navigateToBreadcrumb(-1)">' + escapeHtml(baseName) + '</span>';

      if (currentPath) {
        const parts = currentPath.split('/').filter(p => p);
        parts.forEach((part, i) => {
          html += '<span class="breadcrumb-separator">/</span>';
          html += '<span class="breadcrumb-item" onclick="navigateToBreadcrumb(' + i + ')">' + escapeHtml(part) + '</span>';
        });
      }

      breadcrumb.innerHTML = html;
    }

    function updateSelectedPath() {
      const pathEl = document.getElementById('selectedPath');
      pathEl.textContent = selectedFullPath;
      pathEl.style.display = 'block';
      document.getElementById('startSessionBtn').disabled = !selectedFullPath;
    }

    async function startSession() {
      if (!selectedFullPath) return;

      const btn = document.getElementById('startSessionBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="loading-spinner"></span> Starting...';

      try {
        const res = await fetch(API_BASE + '/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dir: selectedFullPath })
        });

        const data = await res.json();

        if (!res.ok) {
          alert('Failed to start session: ' + (data.error || 'Unknown error'));
          btn.disabled = false;
          btn.textContent = 'Start Session';
          return;
        }

        // Redirect to the new session
        window.location.href = data.fullPath + '/';
      } catch (e) {
        console.error('Failed to start session:', e);
        alert('Failed to start session');
        btn.disabled = false;
        btn.textContent = 'Start Session';
      }
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    function escapeJs(str) {
      return str.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");
    }

    // Close modal on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeDirBrowser();
      }
    });

    // Close modal on background click
    document.getElementById('dirBrowserModal').addEventListener('click', function(e) {
      if (e.target === this) {
        closeDirBrowser();
      }
    });
  </script>`;
}

export function generatePortalHtml(config: Config, sessions: SessionState[]): string {
  const basePath = config.base_path;
  const sessionItems = sessions
    .map((session) => {
      const fullPath = getFullPath(config, session.path);
      return `      <li class="session" data-session-name="${escapeHtml(session.name)}">
        <a href="${fullPath}/" target="_blank">
          <span class="session-header">
            <span class="name">${escapeHtml(session.name)}</span>
            <span class="agent-badge agent-badge--unknown" data-agent-badge="${escapeHtml(session.name)}"></span>
          </span>
          <span class="info">${escapeHtml(session.dir)}</span>
        </a>
      </li>`;
    })
    .join('\n');

  const noSessions = sessions.length === 0 ? '<p class="no-sessions">No active sessions</p>' : '';

  const dirBrowserEnabled = config.directory_browser.enabled;
  const newSessionButton = dirBrowserEnabled
    ? '<button class="new-session-btn" onclick="openDirBrowser()">+ New Shell Session</button>'
    : '';
  const dirBrowserModal = dirBrowserEnabled ? generateDirectoryBrowserModal() : '';
  const dirBrowserScript = dirBrowserEnabled ? generateDirectoryBrowserScript(basePath) : '';
  const dirBrowserCss = dirBrowserEnabled ? directoryBrowserStyles : '';

  // tmux sessions section
  const tmuxSessionsSection = generateTmuxSessionsSection();
  const tmuxSessionsStyles = generateTmuxSessionsStyles();
  const tmuxSessionsScript = generateTmuxSessionsScript(basePath);

  // Active sessions section (only if there are sessions)
  const activeSessionsSection =
    sessions.length > 0
      ? `<div class="active-sessions-section">
    <div class="section-header">
      <span class="section-icon">&#128187;</span>
      <h2>Active Sessions</h2>
    </div>
    <ul>
${sessionItems}
    </ul>
  </div>`
      : noSessions;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>bunterm</title>${generatePwaHead(basePath)}
  <style>${portalStyles}
    .refresh {
      margin-top: 2rem;
      text-align: center;
    }
    .refresh a {
      color: #00d9ff;
      text-decoration: none;
    }
    .refresh a:hover {
      text-decoration: underline;
    }${dirBrowserCss}${tmuxSessionsStyles}
  </style>
</head>
<body>
  <h1>bunterm</h1>
  <p class="subtitle">Terminal Portal</p>
  ${tmuxSessionsSection}
  ${activeSessionsSection}
  ${newSessionButton}
  <div class="refresh">
    <a href="javascript:location.reload()">Refresh</a>
  </div>${dirBrowserModal}${generateSwRegistration(basePath)}${generateAutoReloadScript()}${dirBrowserScript}${tmuxSessionsScript}
</body>
</html>
`;
}

export function generateJsonResponse(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
