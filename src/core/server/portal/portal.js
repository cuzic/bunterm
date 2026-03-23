/**
 * Portal page JavaScript
 *
 * Handles auto-reload, tmux session management, and directory browser.
 * Reads configuration from window.__PORTAL_BASE_PATH__.
 */
(() => {
  var BASE_PATH = window.__PORTAL_BASE_PATH__ || '';

  // === Shared utilities ===

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeJs(str) {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  // === Auto-reload on tab focus ===

  // biome-ignore lint: static page script
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      location.reload();
    }
  });

  // === tmux sessions ===

  function loadTmuxSessions() {
    var section = document.getElementById('tmuxSessionsSection');
    var list = document.getElementById('tmuxSessionsList');

    if (!section || !list) return;

    fetch(`${BASE_PATH}/api/tmux/sessions`)
      .then((res) => res.json())
      .then((json) => {
        var data = json.data;

        if (!data.installed) {
          section.style.display = 'none';
          return;
        }

        if (data.sessions.length === 0) {
          // biome-ignore lint: client-side DOM rendering
          list.innerHTML = '<li class="empty-message">No tmux sessions available</li>';
          section.style.display = 'block';
          return;
        }

        // biome-ignore lint: client-side DOM rendering
        list.innerHTML = data.sessions
          .map((s) => {
            var meta =
              s.windows +
              ' window' +
              (s.windows !== 1 ? 's' : '') +
              (s.attached ? ' \u2022 <span class="attached">attached</span>' : '');
            return (
              '<li>' +
              '<div class="tmux-session-item">' +
              '<div class="tmux-session-info">' +
              '<span class="tmux-session-name">' +
              escapeHtml(s.name) +
              '</span>' +
              '<span class="tmux-session-meta">' +
              meta +
              '</span>' +
              '</div>' +
              '<button class="tmux-connect-btn" onclick="window.__portal.connectToTmux(\'' +
              escapeJs(s.name) +
              '\')">Connect</button>' +
              '</div>' +
              '</li>'
            );
          })
          .join('');

        section.style.display = 'block';
      })
      .catch((e) => {
        console.error('Failed to load tmux sessions:', e);
        if (section) section.style.display = 'none';
      });
  }

  function connectToTmux(tmuxSessionName) {
    var btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    fetch(`${BASE_PATH}/api/sessions`)
      .then((res) => res.json())
      .then((json) => {
        var sessions = json.data;
        var existing =
          sessions.find((s) => s.tmuxSession === tmuxSessionName) ||
          sessions.find((s) => s.name === tmuxSessionName);

        if (existing) {
          window.open(`${BASE_PATH}/${encodeURIComponent(existing.name)}/`, '_blank');
          btn.disabled = false;
          btn.textContent = 'Connect';
          return;
        }

        // Get tmux session's current working directory
        return fetch(`${BASE_PATH}/api/tmux/sessions`)
          .then((res) => res.json())
          .then((cwdJson) => {
            var sess = cwdJson.data.sessions.find((s) => s.name === tmuxSessionName);
            var dir = sess?.cwd ? sess.cwd : null;

            return fetch(`${BASE_PATH}/api/sessions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: tmuxSessionName,
                dir: dir,
                tmuxSession: tmuxSessionName
              })
            });
          })
          .then((res) =>
            res.json().then((json) => {
              if (!res.ok) {
                alert(`Failed to connect: ${json.error?.message || 'Unknown error'}`);
                btn.disabled = false;
                btn.textContent = 'Connect';
                return;
              }
              window.open(`${BASE_PATH}/${encodeURIComponent(json.data.name)}/`, '_blank');
              btn.disabled = false;
              btn.textContent = 'Connect';
            })
          );
      })
      .catch((e) => {
        console.error('Failed to connect to tmux session:', e);
        alert('Failed to connect to tmux session');
        btn.disabled = false;
        btn.textContent = 'Connect';
      });
  }

  // === Directory browser ===

  var allowedDirs = [];
  var currentBaseIndex = -1;
  var currentPath = '';
  var selectedFullPath = '';

  function openDirBrowser() {
    var modal = document.getElementById('dirBrowserModal');
    if (modal) {
      modal.classList.add('active');
      loadAllowedDirs();
    }
  }

  function closeDirBrowser() {
    var modal = document.getElementById('dirBrowserModal');
    if (modal) modal.classList.remove('active');
    resetBrowser();
  }

  function resetBrowser() {
    currentBaseIndex = -1;
    currentPath = '';
    selectedFullPath = '';
    var baseDir = document.getElementById('baseDir');
    if (baseDir) baseDir.value = '';
    var dirList = document.getElementById('dirList');
    // biome-ignore lint: client-side DOM rendering
    if (dirList) dirList.innerHTML = '<li class="empty-message">Select a base directory</li>';
    var breadcrumb = document.getElementById('breadcrumb');
    if (breadcrumb) breadcrumb.innerHTML = '';
    var selectedPath = document.getElementById('selectedPath');
    if (selectedPath) selectedPath.style.display = 'none';
    var startBtn = document.getElementById('startSessionBtn');
    if (startBtn) startBtn.disabled = true;
  }

  function loadAllowedDirs() {
    fetch(`${BASE_PATH}/api/directories`)
      .then((res) => res.json())
      .then((data) => {
        allowedDirs = data.directories || [];
        var select = document.getElementById('baseDir');
        if (select) {
          var optionsHtml =
            '<option value="">Select a directory...</option>' +
            allowedDirs
              .map((d, i) => `<option value="${i}">${escapeHtml(d.name)}</option>`)
              .join('');
          // biome-ignore lint: client-side DOM rendering
          select.innerHTML = optionsHtml;
        }
      })
      .catch((e) => {
        console.error('Failed to load directories:', e);
        var dirList = document.getElementById('dirList');
        if (dirList)
          // biome-ignore lint: client-side DOM rendering
          dirList.innerHTML = '<li class="empty-message">Failed to load directories</li>';
      });
  }

  function onBaseDirChange() {
    var select = document.getElementById('baseDir');
    var index = parseInt(select.value, 10);

    if (Number.isNaN(index) || index < 0) {
      resetBrowser();
      return;
    }

    currentBaseIndex = index;
    currentPath = '';
    loadDirectories();
  }

  function loadDirectories() {
    if (currentBaseIndex < 0) return;

    var dirList = document.getElementById('dirList');
    var loadingHtml =
      '<li class="empty-message"><span class="loading-spinner"></span> Loading...</li>';
    // biome-ignore lint: client-side DOM rendering
    dirList.innerHTML = loadingHtml;

    var url =
      BASE_PATH +
      '/api/directories/list?base=' +
      currentBaseIndex +
      '&path=' +
      encodeURIComponent(currentPath);
    fetch(url)
      .then((res) =>
        res.json().then((data) => {
          if (!res.ok) {
            // biome-ignore lint: client-side DOM rendering
            dirList.innerHTML = `<li class="empty-message">${escapeHtml(data.error || 'Failed to load')}</li>`;
            return;
          }

          selectedFullPath = data.current;
          updateBreadcrumb();
          updateSelectedPath();

          if (data.directories.length === 0) {
            // biome-ignore lint: client-side DOM rendering
            dirList.innerHTML = '<li class="empty-message">No subdirectories</li>';
          } else {
            // biome-ignore lint: client-side DOM rendering
            dirList.innerHTML = data.directories
              .map(
                (d) =>
                  '<li class="directory-item" onclick="window.__portal.navigateToDir(\'' +
                  escapeJs(d.path) +
                  '\')">' +
                  '<span class="icon">&#128193;</span>' +
                  '<span class="name">' +
                  escapeHtml(d.name) +
                  '</span>' +
                  '<span class="expand">&#8250;</span>' +
                  '</li>'
              )
              .join('');
          }
        })
      )
      .catch((e) => {
        console.error('Failed to load directories:', e);
        // biome-ignore lint: client-side DOM rendering
        dirList.innerHTML = '<li class="empty-message">Failed to load directories</li>';
      });
  }

  function navigateToDir(path) {
    currentPath = path;
    loadDirectories();
  }

  function navigateToBreadcrumb(index) {
    if (index < 0) {
      currentPath = '';
    } else {
      var parts = currentPath.split('/').filter((p) => p);
      currentPath = parts.slice(0, index + 1).join('/');
    }
    loadDirectories();
  }

  function updateBreadcrumb() {
    var breadcrumb = document.getElementById('breadcrumb');
    var baseName = allowedDirs[currentBaseIndex] ? allowedDirs[currentBaseIndex].name : '';

    var html =
      '<span class="breadcrumb-item" onclick="window.__portal.navigateToBreadcrumb(-1)">' +
      escapeHtml(baseName) +
      '</span>';

    if (currentPath) {
      var parts = currentPath.split('/').filter((p) => p);
      parts.forEach((part, i) => {
        html += '<span class="breadcrumb-separator">/</span>';
        html +=
          '<span class="breadcrumb-item" onclick="window.__portal.navigateToBreadcrumb(' +
          i +
          ')">' +
          escapeHtml(part) +
          '</span>';
      });
    }

    // biome-ignore lint: client-side DOM rendering
    breadcrumb.innerHTML = html;
  }

  function updateSelectedPath() {
    var pathEl = document.getElementById('selectedPath');
    pathEl.textContent = selectedFullPath;
    pathEl.style.display = 'block';
    document.getElementById('startSessionBtn').disabled = !selectedFullPath;
  }

  function startSession() {
    if (!selectedFullPath) return;

    var btn = document.getElementById('startSessionBtn');
    btn.disabled = true;
    // biome-ignore lint: client-side DOM rendering
    btn.innerHTML = '<span class="loading-spinner"></span> Starting...';

    fetch(`${BASE_PATH}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir: selectedFullPath })
    })
      .then((res) =>
        res.json().then((data) => {
          if (!res.ok) {
            alert(`Failed to start session: ${data.error || 'Unknown error'}`);
            btn.disabled = false;
            btn.textContent = 'Start Session';
            return;
          }
          window.location.href = `${data.fullPath}/`;
        })
      )
      .catch((e) => {
        console.error('Failed to start session:', e);
        alert('Failed to start session');
        btn.disabled = false;
        btn.textContent = 'Start Session';
      });
  }

  // === Event listeners for directory browser modal ===

  // biome-ignore lint: static page script
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDirBrowser();
    }
  });

  var modal = document.getElementById('dirBrowserModal');
  if (modal) {
    // biome-ignore lint: static page script
    modal.addEventListener('click', function (e) {
      if (e.target === this) {
        closeDirBrowser();
      }
    });
  }

  // === Expose functions for onclick handlers ===

  window.__portal = {
    connectToTmux: connectToTmux,
    openDirBrowser: openDirBrowser,
    closeDirBrowser: closeDirBrowser,
    onBaseDirChange: onBaseDirChange,
    navigateToDir: navigateToDir,
    navigateToBreadcrumb: navigateToBreadcrumb,
    startSession: startSession
  };

  // === Agent status polling ===

  function updateAgentBadges() {
    fetch(`${BASE_PATH}/api/agents/status`)
      .then((res) => res.json())
      .then((json) => {
        var statuses = json.data;
        if (!Array.isArray(statuses)) return;

        statuses.forEach((agent) => {
          var badge = document.querySelector(`[data-agent-badge="${agent.sessionName}"]`);
          if (!badge) return;
          badge.className = `agent-badge agent-badge--${agent.status}`;
          badge.title =
            agent.status === 'active'
              ? `Agent active${agent.lastTool ? ` (${agent.lastTool})` : ''}`
              : agent.status === 'idle'
                ? 'Agent idle'
                : agent.status === 'error'
                  ? 'Agent error'
                  : '';
        });
      })
      .catch(() => {
        // Silently ignore - badges will remain in current state
      });
  }

  // Poll every 10 seconds
  updateAgentBadges();
  setInterval(updateAgentBadges, 10000);

  // === Initialize ===

  loadTmuxSessions();
})();
