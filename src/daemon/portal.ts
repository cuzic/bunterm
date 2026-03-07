import { getFullPath, normalizeBasePath } from '@/config/config.js';
import type { Config, SessionState } from '@/config/types.js';
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
  const basePath = normalizeBasePath(config.base_path);
  const sessionItems = sessions
    .map((session) => {
      const fullPath = getFullPath(config, session.path);
      return `      <li class="session">
        <a href="${fullPath}/" target="_blank">
          <span class="name">${escapeHtml(session.name)}</span>
          <span class="info">${escapeHtml(session.dir)}</span>
        </a>
      </li>`;
    })
    .join('\n');

  const noSessions =
    sessions.length === 0
      ? '<p class="no-sessions">No active sessions. Use <code>bunterm up</code> to start one.</p>'
      : '';

  const dirBrowserEnabled = config.directory_browser.enabled;
  const newSessionButton = dirBrowserEnabled
    ? '<button class="new-session-btn" onclick="openDirBrowser()">+ New Session</button>'
    : '';
  const dirBrowserModal = dirBrowserEnabled ? generateDirectoryBrowserModal() : '';
  const dirBrowserScript = dirBrowserEnabled ? generateDirectoryBrowserScript(basePath) : '';
  const dirBrowserCss = dirBrowserEnabled ? directoryBrowserStyles : '';

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
    }${dirBrowserCss}
  </style>
</head>
<body>
  <h1>bunterm</h1>
  <p class="subtitle">Active Terminal Sessions</p>
  <ul>
${sessionItems}
  </ul>
  ${noSessions}
  ${newSessionButton}
  <div class="refresh">
    <a href="javascript:location.reload()">Refresh</a>
  </div>${dirBrowserModal}${generateSwRegistration(basePath)}${generateAutoReloadScript()}${dirBrowserScript}
</body>
</html>
`;
}

export function generateJsonResponse(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
