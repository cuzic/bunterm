/**
 * Session Switcher Manager
 *
 * Handles session switching modal functionality:
 * - Load sessions from API
 * - Display session list with search filtering
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Navigate to selected session
 */

import { toolbarEvents } from '@/browser/shared/events.js';
import { type Mountable, type Scope, on, onBus } from '@/browser/shared/lifecycle.js';
import type { SessionSwitcherElements, TerminalUiConfig } from '@/browser/shared/types.js';
import { bindClickScoped } from '@/browser/shared/utils.js';

/** Session data from API */
interface SessionInfo {
  name: string;
  dir: string;
  path: string;
  fullPath: string;
}

/** Tmux session data from API */
interface TmuxSessionInfo {
  name: string;
  windows: number;
  created: string;
  attached: boolean;
}

export class SessionSwitcher implements Mountable {
  private config: TerminalUiConfig;
  private elements: SessionSwitcherElements | null = null;
  private sessions: SessionInfo[] = [];
  private filteredSessions: SessionInfo[] = [];
  private tmuxSessions: TmuxSessionInfo[] = [];
  private filteredTmuxSessions: TmuxSessionInfo[] = [];
  private tmuxInstalled = false;
  private selectedIndex = 0;
  private selectedSection: 'bunterm' | 'tmux' = 'bunterm';
  private currentSessionName: string | null = null;
  private isVisible = false;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.currentSessionName = this.extractCurrentSessionName();
  }

  /**
   * Extract current session name from URL path
   */
  private extractCurrentSessionName(): string | null {
    const basePath = this.config.base_path;
    const path = window.location.pathname;

    if (path.startsWith(basePath)) {
      const remainder = path.slice(basePath.length);
      const segments = remainder.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) {
        return decodeURIComponent(segments[0]);
      }
    }
    return null;
  }

  /**
   * Bind DOM elements (stores reference only)
   */
  bindElements(elements: SessionSwitcherElements): void {
    this.elements = elements;
  }

  /**
   * Mount event listeners to scope for automatic cleanup
   */
  mount(scope: Scope): void {
    const { elements } = this;
    if (!elements) {
      return;
    }

    // Close button
    bindClickScoped(scope, elements.modalClose, () => this.hide());

    // Refresh button
    bindClickScoped(scope, elements.refreshBtn, () => this.loadSessions());

    // Session button in toolbar
    bindClickScoped(scope, elements.sessionBtn, () => this.toggle());

    // Search input
    scope.add(
      on(elements.searchInput, 'input', () => {
        this.filterSessions();
        this.selectedIndex = 0;
        this.renderSessions();
      })
    );

    // Keyboard navigation
    scope.add(
      on(elements.searchInput, 'keydown', (e: Event) => this.handleKeydown(e as KeyboardEvent))
    );
    scope.add(on(elements.modal, 'keydown', (e: Event) => this.handleKeydown(e as KeyboardEvent)));

    // Close on backdrop click
    scope.add(
      on(elements.modal, 'click', (e: Event) => {
        if (e.target === elements.modal) {
          this.hide();
        }
      })
    );

    // Listen for session:open event
    scope.add(onBus(toolbarEvents, 'session:open', () => this.show()));
  }

  /**
   * Handle keyboard events
   */
  private handleKeydown(e: KeyboardEvent): void {
    if (!this.isVisible) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        this.selectNext();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        this.selectPrevious();
        break;
      }
      case 'Tab': {
        // Switch between bunterm and tmux sections
        if (this.tmuxInstalled && this.tmuxSessions.length > 0) {
          e.preventDefault();
          this.selectedSection = this.selectedSection === 'bunterm' ? 'tmux' : 'bunterm';
          this.selectedIndex = 0;
          this.renderSessions();
        }
        break;
      }
      case 'Enter': {
        e.preventDefault();
        this.navigateToSelected();
        break;
      }
      case 'Escape': {
        e.preventDefault();
        this.hide();
        break;
      }
    }
  }

  /**
   * Get the current list based on selected section
   */
  private getCurrentList(): SessionInfo[] | TmuxSessionInfo[] {
    return this.selectedSection === 'bunterm' ? this.filteredSessions : this.filteredTmuxSessions;
  }

  /**
   * Select next session in list
   */
  private selectNext(): void {
    const currentList = this.getCurrentList();
    if (currentList.length === 0) {
      // Try to switch to the other section
      if (this.selectedSection === 'bunterm' && this.filteredTmuxSessions.length > 0) {
        this.selectedSection = 'tmux';
        this.selectedIndex = 0;
      } else if (this.selectedSection === 'tmux' && this.filteredSessions.length > 0) {
        this.selectedSection = 'bunterm';
        this.selectedIndex = 0;
      } else {
        return;
      }
    } else {
      const newIndex = this.selectedIndex + 1;
      if (newIndex >= currentList.length) {
        // Move to next section or wrap around
        if (this.selectedSection === 'bunterm' && this.filteredTmuxSessions.length > 0) {
          this.selectedSection = 'tmux';
          this.selectedIndex = 0;
        } else if (this.selectedSection === 'tmux' && this.filteredSessions.length > 0) {
          this.selectedSection = 'bunterm';
          this.selectedIndex = 0;
        } else {
          this.selectedIndex = 0;
        }
      } else {
        this.selectedIndex = newIndex;
      }
    }
    this.renderSessions();
    this.scrollToSelected();
  }

  /**
   * Select previous session in list
   */
  private selectPrevious(): void {
    const currentList = this.getCurrentList();
    if (currentList.length === 0) {
      // Try to switch to the other section
      if (this.selectedSection === 'bunterm' && this.filteredTmuxSessions.length > 0) {
        this.selectedSection = 'tmux';
        this.selectedIndex = this.filteredTmuxSessions.length - 1;
      } else if (this.selectedSection === 'tmux' && this.filteredSessions.length > 0) {
        this.selectedSection = 'bunterm';
        this.selectedIndex = this.filteredSessions.length - 1;
      } else {
        return;
      }
    } else {
      const newIndex = this.selectedIndex - 1;
      if (newIndex < 0) {
        // Move to previous section or wrap around
        if (this.selectedSection === 'tmux' && this.filteredSessions.length > 0) {
          this.selectedSection = 'bunterm';
          this.selectedIndex = this.filteredSessions.length - 1;
        } else if (this.selectedSection === 'bunterm' && this.filteredTmuxSessions.length > 0) {
          this.selectedSection = 'tmux';
          this.selectedIndex = this.filteredTmuxSessions.length - 1;
        } else {
          this.selectedIndex = currentList.length - 1;
        }
      } else {
        this.selectedIndex = newIndex;
      }
    }
    this.renderSessions();
    this.scrollToSelected();
  }

  /**
   * Scroll to keep selected item visible
   */
  private scrollToSelected(): void {
    const selectedEl = this.elements?.sessionList.querySelector('.tui-session-item.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  /**
   * Navigate to selected session
   */
  private navigateToSelected(): void {
    if (this.selectedSection === 'bunterm') {
      const session = this.filteredSessions[this.selectedIndex];
      if (session) {
        this.navigateToSession(session);
      }
    } else {
      const tmuxSession = this.filteredTmuxSessions[this.selectedIndex];
      if (tmuxSession) {
        this.connectToTmuxSession(tmuxSession);
      }
    }
  }

  /**
   * Navigate to a session (opens in new tab)
   */
  private navigateToSession(session: SessionInfo): void {
    if (session.name === this.currentSessionName) {
      // Already on this session, just close the modal
      this.hide();
      return;
    }
    // Open in new tab
    window.open(session.fullPath, '_blank');
    this.hide();
  }

  /**
   * Connect to a tmux session by creating a bunterm session that attaches to it
   */
  private async connectToTmuxSession(tmuxSession: TmuxSessionInfo): Promise<void> {
    const sessionName = `tmux-${tmuxSession.name}-${Date.now().toString(36)}`;

    try {
      const response = await fetch(`${this.config.base_path}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sessionName,
          dir: '.',
          tmuxSession: tmuxSession.name
        })
      });

      if (!response.ok) {
        // Failed to connect - user will see the modal still open
        return;
      }

      // Open in new tab
      const fullPath = `${this.config.base_path}/${encodeURIComponent(sessionName)}/`;
      window.open(fullPath, '_blank');
      this.hide();
    } catch (_error) {
      // Failed to connect - user will see the modal still open
    }
  }

  /**
   * Show the modal
   */
  async show(): Promise<void> {
    if (!this.elements) {
      return;
    }

    this.isVisible = true;
    this.elements.modal.classList.remove('hidden');
    this.elements.searchInput.value = '';
    this.elements.searchInput.focus();

    await this.loadSessions();

    toolbarEvents.emit('modal:open', 'session');
  }

  /**
   * Hide the modal
   */
  hide(): void {
    if (!this.elements) {
      return;
    }

    this.isVisible = false;
    this.elements.modal.classList.add('hidden');
    this.selectedIndex = 0;

    toolbarEvents.emit('modal:close', 'session');
  }

  /**
   * Toggle modal visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Load sessions from API
   */
  async loadSessions(): Promise<void> {
    if (!this.elements) {
      return;
    }

    this.elements.sessionList.innerHTML = '<div id="tui-session-loading">読み込み中...</div>';

    try {
      // Load both bunterm sessions and tmux sessions in parallel
      const [sessionsResponse, tmuxResponse] = await Promise.all([
        fetch(`${this.config.base_path}/api/sessions`),
        fetch(`${this.config.base_path}/api/tmux/sessions`)
      ]);

      if (!sessionsResponse.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const sessionsData = (await sessionsResponse.json()) as SessionInfo[];
      this.sessions = sessionsData.map((s) => ({
        name: s.name,
        dir: s.dir,
        path: s.path,
        fullPath: `${this.config.base_path}/${encodeURIComponent(s.name)}/`
      }));

      // Load tmux sessions if available
      if (tmuxResponse.ok) {
        const tmuxData = (await tmuxResponse.json()) as {
          sessions: TmuxSessionInfo[];
          installed: boolean;
        };
        this.tmuxInstalled = tmuxData.installed;
        this.tmuxSessions = tmuxData.sessions;
      } else {
        this.tmuxInstalled = false;
        this.tmuxSessions = [];
      }

      this.filterSessions();
      this.renderSessions();
    } catch (_error) {
      this.elements.sessionList.innerHTML =
        '<div id="tui-session-error">セッションの読み込みに失敗しました</div>';
    }
  }

  /**
   * Filter sessions based on search input
   */
  private filterSessions(): void {
    const query = this.elements?.searchInput.value.toLowerCase() ?? '';

    // Filter bunterm sessions
    if (query) {
      this.filteredSessions = this.sessions.filter(
        (s) => s.name.toLowerCase().includes(query) || s.dir.toLowerCase().includes(query)
      );
    } else {
      this.filteredSessions = [...this.sessions];
    }

    // Sort: current session first, then alphabetically
    this.filteredSessions.sort((a, b) => {
      const aCurrent = a.name === this.currentSessionName;
      const bCurrent = b.name === this.currentSessionName;
      if (aCurrent && !bCurrent) {
        return -1;
      }
      if (!aCurrent && bCurrent) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Filter tmux sessions
    if (query) {
      this.filteredTmuxSessions = this.tmuxSessions.filter((s) =>
        s.name.toLowerCase().includes(query)
      );
    } else {
      this.filteredTmuxSessions = [...this.tmuxSessions];
    }

    // Sort tmux sessions: attached first, then alphabetically
    this.filteredTmuxSessions.sort((a, b) => {
      if (a.attached && !b.attached) {
        return -1;
      }
      if (!a.attached && b.attached) {
        return 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Render session list
   */
  private renderSessions(): void {
    if (!this.elements) {
      return;
    }

    const hasBuntermSessions = this.filteredSessions.length > 0;
    const hasTmuxSessions = this.tmuxInstalled && this.filteredTmuxSessions.length > 0;

    if (!hasBuntermSessions && !hasTmuxSessions) {
      this.elements.sessionList.innerHTML =
        '<div id="tui-session-empty">セッションが見つかりません</div>';
      return;
    }

    let html = '';

    // Bunterm sessions section
    if (hasBuntermSessions) {
      html += '<div class="tui-session-section">';
      html += '<div class="tui-session-section-header">bunterm Sessions</div>';
      html += this.filteredSessions
        .map((session, index) => {
          const isCurrent = session.name === this.currentSessionName;
          const isSelected = this.selectedSection === 'bunterm' && index === this.selectedIndex;
          const classes = [
            'tui-session-item',
            isCurrent ? 'current' : '',
            isSelected ? 'selected' : ''
          ]
            .filter(Boolean)
            .join(' ');

          return `
            <div class="${classes}" data-section="bunterm" data-index="${index}">
              <span class="tui-session-icon">${isCurrent ? '📍' : '📁'}</span>
              <div class="tui-session-info">
                <div class="tui-session-name">${this.escapeHtml(session.name)}</div>
                <div class="tui-session-path">${this.escapeHtml(session.dir)}</div>
              </div>
              ${isCurrent ? '<span class="tui-session-current-badge">現在</span>' : ''}
            </div>
          `;
        })
        .join('');
      html += '</div>';
    }

    // Tmux sessions section
    if (hasTmuxSessions) {
      html += '<div class="tui-session-section tui-tmux-section">';
      html += '<div class="tui-session-section-header">tmux Sessions</div>';
      html += this.filteredTmuxSessions
        .map((tmuxSession, index) => {
          const isSelected = this.selectedSection === 'tmux' && index === this.selectedIndex;
          const classes = [
            'tui-session-item',
            'tui-tmux-item',
            tmuxSession.attached ? 'attached' : '',
            isSelected ? 'selected' : ''
          ]
            .filter(Boolean)
            .join(' ');

          const meta = `${tmuxSession.windows} window${tmuxSession.windows !== 1 ? 's' : ''}`;

          return `
            <div class="${classes}" data-section="tmux" data-index="${index}">
              <span class="tui-session-icon">🖥️</span>
              <div class="tui-session-info">
                <div class="tui-session-name">${this.escapeHtml(tmuxSession.name)}</div>
                <div class="tui-session-path">${meta}</div>
              </div>
              ${tmuxSession.attached ? '<span class="tui-session-attached-badge">attached</span>' : ''}
            </div>
          `;
        })
        .join('');
      html += '</div>';
    }

    this.elements.sessionList.innerHTML = html;

    // Add click handlers for bunterm sessions
    const buntermItems = this.elements.sessionList.querySelectorAll(
      '.tui-session-item[data-section="bunterm"]'
    );
    buntermItems.forEach((item) => {
      item.addEventListener('click', () => {
        const index = Number.parseInt(item.getAttribute('data-index') ?? '0', 10);
        const session = this.filteredSessions[index];
        if (session) {
          this.navigateToSession(session);
        }
      });
    });

    // Add click handlers for tmux sessions
    const tmuxItems = this.elements.sessionList.querySelectorAll(
      '.tui-session-item[data-section="tmux"]'
    );
    tmuxItems.forEach((item) => {
      item.addEventListener('click', () => {
        const index = Number.parseInt(item.getAttribute('data-index') ?? '0', 10);
        const tmuxSession = this.filteredTmuxSessions[index];
        if (tmuxSession) {
          this.connectToTmuxSession(tmuxSession);
        }
      });
    });
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
