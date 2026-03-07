/**
 * Session Switcher Manager
 *
 * Handles session switching modal functionality:
 * - Load sessions from API
 * - Display session list with search filtering
 * - Keyboard navigation (arrow keys, Enter, Escape)
 * - Navigate to selected session
 */

import { toolbarEvents } from './events.js';
import { type Mountable, type Scope, on, onBus } from './lifecycle.js';
import type { SessionSwitcherElements, TerminalUiConfig } from './types.js';
import { bindClickScoped } from './utils.js';

/** Session data from API */
interface SessionInfo {
  name: string;
  dir: string;
  path: string;
  fullPath: string;
}

export class SessionSwitcher implements Mountable {
  private config: TerminalUiConfig;
  private elements: SessionSwitcherElements | null = null;
  private sessions: SessionInfo[] = [];
  private filteredSessions: SessionInfo[] = [];
  private selectedIndex = 0;
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
   * Select next session in list
   */
  private selectNext(): void {
    if (this.filteredSessions.length === 0) {
      return;
    }
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredSessions.length;
    this.renderSessions();
    this.scrollToSelected();
  }

  /**
   * Select previous session in list
   */
  private selectPrevious(): void {
    if (this.filteredSessions.length === 0) {
      return;
    }
    this.selectedIndex =
      (this.selectedIndex - 1 + this.filteredSessions.length) % this.filteredSessions.length;
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
    const session = this.filteredSessions[this.selectedIndex];
    if (session) {
      this.navigateToSession(session);
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
      const response = await fetch(`${this.config.base_path}/api/sessions`);
      if (!response.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = (await response.json()) as SessionInfo[];
      this.sessions = data.map((s) => ({
        name: s.name,
        dir: s.dir,
        path: s.path,
        fullPath: `${this.config.base_path}/${encodeURIComponent(s.name)}/`
      }));

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
  }

  /**
   * Render session list
   */
  private renderSessions(): void {
    if (!this.elements) {
      return;
    }

    if (this.filteredSessions.length === 0) {
      this.elements.sessionList.innerHTML =
        '<div id="tui-session-empty">セッションが見つかりません</div>';
      return;
    }

    const html = this.filteredSessions
      .map((session, index) => {
        const isCurrent = session.name === this.currentSessionName;
        const isSelected = index === this.selectedIndex;
        const classes = [
          'tui-session-item',
          isCurrent ? 'current' : '',
          isSelected ? 'selected' : ''
        ]
          .filter(Boolean)
          .join(' ');

        return `
          <div class="${classes}" data-index="${index}">
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

    this.elements.sessionList.innerHTML = html;

    // Add click handlers
    const items = this.elements.sessionList.querySelectorAll('.tui-session-item');
    items.forEach((item) => {
      item.addEventListener('click', () => {
        const index = Number.parseInt(item.getAttribute('data-index') ?? '0', 10);
        const session = this.filteredSessions[index];
        if (session) {
          this.navigateToSession(session);
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
