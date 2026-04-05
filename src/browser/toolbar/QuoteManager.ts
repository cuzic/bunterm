/**
 * Quote Manager
 *
 * Manages the Quote to Clipboard modal for copying content to another AI.
 * Supports 4 tabs: Claude Turns, Project Markdown, Plans, Git Diff
 */

import { type Mountable, Scope } from '@/browser/shared/lifecycle.js';
import type { TerminalUiConfig } from '@/browser/shared/types.js';
import {
  bindBackdropClose,
  bindClickScoped,
  formatRelativeTime,
  getSessionName
} from '@/browser/shared/utils.js';
import type {
  ClaudeSessionInfo,
  ClaudeTurnFull,
  ClaudeTurnSummary,
  GitDiffResponse,
  MarkdownFile
} from '@/features/ai/server/quotes/types.js';
import { fetchJSON } from './ApiClient.js';

// Types
type QuoteTab = 'turns' | 'projectMd' | 'plans' | 'gitDiff' | 'repomix';

interface RepomixResult {
  content: string;
  fileCount: number;
  tokenCount: number;
  directory: string;
}

interface QuoteElements {
  modal: HTMLElement;
  modalClose: HTMLButtonElement;
  tabs: HTMLElement;
  controls: HTMLElement;
  selectAllBtn: HTMLButtonElement;
  clearBtn: HTMLButtonElement;
  list: HTMLElement;
  footer: HTMLElement;
  selectionInfo: HTMLElement;
  copyBtn: HTMLButtonElement;
  quoteBtn: HTMLButtonElement;
}

export class QuoteManager implements Mountable {
  private config: TerminalUiConfig;
  private elements: QuoteElements | null = null;
  private isOpen = false;
  private activeTab: QuoteTab = 'turns';

  // Data
  private claudeSessions: ClaudeSessionInfo[] = [];
  private selectedClaudeSession: ClaudeSessionInfo | null = null;
  private turns: ClaudeTurnSummary[] = [];
  private projectMarkdown: MarkdownFile[] = [];
  private plans: MarkdownFile[] = [];
  private gitDiff: GitDiffResponse | null = null;

  // Selection
  private selectedTurnUuids = new Set<string>();
  private selectedFilePaths = new Set<string>();
  private selectedGitFiles = new Set<string>();
  private selectFullDiff = false;

  // Repomix
  private repomixPath = '';
  private repomixResult: RepomixResult | null = null;
  private repomixLoading = false;
  private repomixError: string | null = null;

  // Tooltip
  private tooltipElement: HTMLElement | null = null;
  private tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

  // Scope for list item event listeners (cleared on re-render)
  private listScope: Scope | null = null;

  constructor(config: TerminalUiConfig) {
    this.config = config;
    this.createTooltip();
  }

  /**
   * Create tooltip element
   */
  private createTooltip(): void {
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'tui-quote-tooltip';
    this.tooltipElement.style.cssText = `
      position: fixed;
      z-index: 10002;
      max-width: 600px;
      background: #1a1a2e;
      border: 1px solid #4a4a6a;
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      line-height: 1.4;
      color: #e0e0e0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      pointer-events: none;
      display: none;
      white-space: pre-wrap;
      word-wrap: break-word;
    `;
    document.body.appendChild(this.tooltipElement);
  }

  /**
   * Show tooltip
   */
  private showTooltip(content: HTMLElement, x: number, y: number): void {
    if (!this.tooltipElement) {
      return;
    }

    // Clear any pending hide
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    this.tooltipElement.replaceChildren(content);
    this.tooltipElement.style.display = 'block';
    this.positionTooltip(x, y);
  }

  /**
   * Reposition visible tooltip (for mousemove)
   */
  private repositionTooltip(x: number, y: number): void {
    if (!this.tooltipElement || this.tooltipElement.style.display !== 'block') {
      return;
    }
    this.positionTooltip(x, y);
  }

  private positionTooltip(x: number, y: number): void {
    if (!this.tooltipElement) return;

    const rect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + 10;
    let top = y + 10;

    // Adjust if going off right edge
    if (left + rect.width > viewportWidth - 20) {
      left = x - rect.width - 10;
    }

    // Adjust if going off bottom edge
    if (top + rect.height > viewportHeight - 20) {
      top = y - rect.height - 10;
    }

    // Ensure not going off left/top edge
    left = Math.max(10, left);
    top = Math.max(10, top);

    this.tooltipElement.style.left = `${left}px`;
    this.tooltipElement.style.top = `${top}px`;
  }

  /**
   * Hide tooltip
   */
  private hideTooltip(): void {
    if (!this.tooltipElement) {
      return;
    }

    // Clear any pending hide timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    this.tooltipTimeout = setTimeout(() => {
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
      this.tooltipTimeout = null;
    }, 100);
  }

  /**
   * Hide tooltip immediately
   */
  private hideTooltipImmediately(): void {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }
    if (this.tooltipElement) {
      this.tooltipElement.style.display = 'none';
    }
  }

  /**
   * Bind DOM elements (stores reference only)
   */
  bindElements(elements: QuoteElements): void {
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

    // Modal close
    bindClickScoped(scope, elements.modalClose, () => this.close());

    // Tab switching
    const tabButtons = elements.tabs.querySelectorAll('.tui-quote-tab');
    tabButtons.forEach((btn) => {
      scope.on(btn, 'click', () => {
        const tab = (btn as HTMLElement).dataset['tab'] as QuoteTab;
        if (tab) {
          this.switchTab(tab);
        }
      });
    });

    // Controls
    bindClickScoped(scope, elements.selectAllBtn, () => this.selectAll());
    bindClickScoped(scope, elements.clearBtn, () => this.clearSelection());

    // Copy button
    bindClickScoped(scope, elements.copyBtn, () => this.copyToClipboard());

    // Quote button
    bindClickScoped(scope, elements.quoteBtn, () => this.toggle());

    // Note: Escape key handling is now centralized in KeyRouter

    // Close on backdrop click
    bindBackdropClose(scope, elements.modal, () => this.close());
  }

  /**
   * Toggle modal
   */
  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open modal
   */
  async open(): Promise<void> {
    if (!this.elements) {
      return;
    }

    this.elements.modal.classList.remove('hidden');
    this.isOpen = true;

    // Fetch data
    await this.fetchAllData();

    // Render current tab
    this.renderList();
  }

  /**
   * Close modal
   */
  close(): void {
    if (!this.elements) {
      return;
    }

    this.hideTooltipImmediately();
    this.elements.modal.classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * Check if modal is visible
   */
  isVisible(): boolean {
    return this.elements ? !this.elements.modal.classList.contains('hidden') : false;
  }

  /**
   * Switch tab
   */
  private switchTab(tab: QuoteTab): void {
    if (!this.elements) {
      return;
    }

    this.hideTooltipImmediately();
    this.activeTab = tab;

    // Update tab buttons
    const tabButtons = this.elements.tabs.querySelectorAll('.tui-quote-tab');
    tabButtons.forEach((btn) => {
      const btnTab = (btn as HTMLElement).dataset['tab'];
      btn.classList.toggle('active', btnTab === tab);
    });

    // Render list
    this.renderList();
  }

  /**
   * Fetch all data
   */
  private async fetchAllData(): Promise<void> {
    const basePath = this.config.base_path;
    const sessionName = getSessionName(this.config);

    // First, fetch Claude sessions from history.jsonl
    await this.fetchClaudeSessions(basePath);

    // Auto-select based on current project name (from URL path)
    if (this.claudeSessions.length > 0 && !this.selectedClaudeSession) {
      // Try to find a session matching the current project name
      const matchingSession = this.claudeSessions.find(
        (s) => s.projectName === sessionName || s.projectPath.endsWith(`/${sessionName}`)
      );
      this.selectedClaudeSession = matchingSession ?? this.claudeSessions[0] ?? null;
    }

    // Fetch all in parallel
    await Promise.all([
      this.fetchTurns(basePath),
      this.fetchProjectMarkdown(basePath, sessionName),
      this.fetchPlans(basePath),
      this.fetchGitDiff(basePath, sessionName)
    ]);
  }

  /**
   * Fetch Claude sessions from history.jsonl
   */
  private async fetchClaudeSessions(basePath: string): Promise<void> {
    const data = await fetchJSON<{ sessions: ClaudeSessionInfo[] }>(
      `${basePath}/api/claude-quotes/sessions?limit=10`
    );
    this.claudeSessions = data?.sessions ?? [];
  }

  /**
   * Fetch Claude turns
   */
  private async fetchTurns(basePath: string): Promise<void> {
    if (!this.selectedClaudeSession) {
      this.turns = [];
      return;
    }

    const data = await fetchJSON<{ turns: ClaudeTurnSummary[] }>(
      `${basePath}/api/claude-quotes/recent?claudeSessionId=${encodeURIComponent(this.selectedClaudeSession.sessionId)}&projectPath=${encodeURIComponent(this.selectedClaudeSession.projectPath)}&count=20`
    );
    this.turns = data?.turns ?? [];
  }

  /**
   * Fetch project markdown files (deep search, sorted by modification time)
   */
  private async fetchProjectMarkdown(basePath: string, sessionName: string): Promise<void> {
    // Use recent-markdown endpoint (max 168 hours = 7 days)
    const data = await fetchJSON<{ files: MarkdownFile[] }>(
      `${basePath}/api/claude-quotes/recent-markdown?session=${encodeURIComponent(sessionName)}&count=30&hours=168`
    );
    this.projectMarkdown = data?.files ?? [];
  }

  /**
   * Fetch plan files
   */
  private async fetchPlans(basePath: string): Promise<void> {
    const data = await fetchJSON<{ files: MarkdownFile[] }>(
      `${basePath}/api/claude-quotes/plans?count=10`
    );
    this.plans = data?.files ?? [];
  }

  /**
   * Fetch git diff
   */
  private async fetchGitDiff(basePath: string, sessionName: string): Promise<void> {
    this.gitDiff = await fetchJSON<GitDiffResponse>(
      `${basePath}/api/claude-quotes/git-diff?session=${encodeURIComponent(sessionName)}`
    );
  }

  /**
   * Render list based on active tab
   */
  private renderList(): void {
    if (!this.elements) {
      return;
    }

    // Hide any visible tooltip
    this.hideTooltipImmediately();

    // Close previous list scope and create new one
    this.listScope?.close();
    this.listScope = new Scope();

    const list = this.elements.list;
    list.innerHTML = '';

    switch (this.activeTab) {
      case 'turns':
        this.renderTurns(list);
        break;
      case 'projectMd':
        this.renderMarkdownFiles(list, this.projectMarkdown, 'project');
        break;
      case 'plans':
        this.renderMarkdownFiles(list, this.plans, 'plans');
        break;
      case 'gitDiff':
        this.renderGitDiff(list);
        break;
      case 'repomix':
        this.renderRepomix(list);
        break;
    }

    this.updateSelectionInfo();
  }

  /**
   * Render Claude turns
   */
  private renderTurns(container: HTMLElement): void {
    // Add session selector if we have multiple sessions
    if (this.claudeSessions.length > 0) {
      const selectorDiv = document.createElement('div');
      selectorDiv.className = 'tui-quote-session-selector';

      const label = document.createElement('span');
      label.textContent = 'Session: ';
      label.className = 'tui-quote-session-label';

      const select = document.createElement('select');
      select.className = 'tui-quote-session-select';

      this.claudeSessions.forEach((session) => {
        const option = document.createElement('option');
        option.value = session.sessionId;
        const relTime = formatRelativeTime(new Date(session.lastTimestamp).toISOString(), 'en');
        option.textContent = `${session.projectName} (${relTime})`;
        if (this.selectedClaudeSession?.sessionId === session.sessionId) {
          option.selected = true;
        }
        select.appendChild(option);
      });

      // biome-ignore lint: cleaned up via Mountable lifecycle
      select.addEventListener('change', async () => {
        const newSession = this.claudeSessions.find((s) => s.sessionId === select.value);
        if (newSession) {
          this.selectedClaudeSession = newSession;
          this.selectedTurnUuids.clear();
          await this.fetchTurns(this.config.base_path);
          this.renderList();
        }
      });

      selectorDiv.appendChild(label);
      selectorDiv.appendChild(select);
      container.appendChild(selectorDiv);
    }

    if (this.turns.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'tui-quote-empty';
      emptyDiv.textContent = 'Claude Code ターンが見つかりません';
      container.appendChild(emptyDiv);
      return;
    }

    this.turns.forEach((turn) => {
      const item = document.createElement('label');
      item.className = 'tui-quote-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selectedTurnUuids.has(turn.uuid);
      // biome-ignore lint: cleaned up via Mountable lifecycle
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedTurnUuids.add(turn.uuid);
        } else {
          this.selectedTurnUuids.delete(turn.uuid);
        }
        this.updateSelectionInfo();
      });

      const content = document.createElement('div');
      content.className = 'tui-quote-item-content';

      const header = document.createElement('div');
      header.className = 'tui-quote-item-header';
      // Show assistant response as main text (truncate to 150 chars for display)
      const displayText =
        turn.assistantSummary.length > 150
          ? `${turn.assistantSummary.slice(0, 150)}...`
          : turn.assistantSummary;
      const titleSpan = document.createElement('span');
      titleSpan.className = 'tui-quote-item-title';
      titleSpan.textContent = displayText;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'tui-quote-item-time';
      timeSpan.textContent = formatRelativeTime(turn.timestamp, 'en');

      header.appendChild(titleSpan);
      header.appendChild(timeSpan);

      content.appendChild(header);

      if (turn.hasToolUse) {
        const meta = document.createElement('div');
        meta.className = 'tui-quote-item-meta';
        meta.textContent =
          turn.editedFiles && turn.editedFiles.length > 0
            ? `Edited: ${turn.editedFiles.join(', ')}`
            : 'Used tools';
        content.appendChild(meta);
      }

      // Add hover tooltip for full content preview
      // biome-ignore lint: cleaned up via Mountable lifecycle
      item.addEventListener('mouseenter', (e) => {
        const tooltipContent = this.formatTurnTooltip(turn);
        this.showTooltip(tooltipContent, e.clientX, e.clientY);
      });

      // biome-ignore lint: cleaned up via Mountable lifecycle
      item.addEventListener('mousemove', (e) => {
        // Update tooltip position as mouse moves
        this.repositionTooltip(e.clientX, e.clientY);
      });

      // biome-ignore lint: cleaned up via Mountable lifecycle
      item.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });

      item.appendChild(checkbox);
      item.appendChild(content);
      container.appendChild(item);
    });
  }

  /**
   * Render markdown files
   */
  private renderMarkdownFiles(
    container: HTMLElement,
    files: MarkdownFile[],
    source: 'project' | 'plans'
  ): void {
    if (files.length === 0) {
      const emptyMessages: Record<string, string> = {
        project: 'マークダウンファイルが見つかりません',
        plans: 'プランファイルが見つかりません'
      };
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'tui-quote-empty';
      emptyDiv.textContent = emptyMessages[source] ?? null;
      container.replaceChildren(emptyDiv);
      return;
    }

    files.forEach((file) => {
      const key = `${source}:${file.path}`;
      const item = document.createElement('label');
      item.className = 'tui-quote-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selectedFilePaths.has(key);
      // biome-ignore lint: cleaned up via Mountable lifecycle
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedFilePaths.add(key);
        } else {
          this.selectedFilePaths.delete(key);
        }
        this.updateSelectionInfo();
      });

      const content = document.createElement('div');
      content.className = 'tui-quote-item-content';

      const header = document.createElement('div');
      header.className = 'tui-quote-item-header';
      const fileTitle = document.createElement('span');
      fileTitle.className = 'tui-quote-item-title';
      fileTitle.textContent = file.path;

      const fileTime = document.createElement('span');
      fileTime.className = 'tui-quote-item-time';
      fileTime.textContent = formatRelativeTime(file.modifiedAt, 'en');

      header.appendChild(fileTitle);
      header.appendChild(fileTime);

      const meta = document.createElement('div');
      meta.className = 'tui-quote-item-meta';
      meta.textContent = `${(file.size / 1024).toFixed(1)} KB`;

      content.appendChild(header);
      content.appendChild(meta);

      // Add hover tooltip for file content preview (PC) or long press (mobile)
      if (this.isMobile()) {
        this.setupLongPress(item, async (x, y) => {
          const preview = await this.fetchFilePreview(source, file.path);
          if (preview) {
            this.showTooltip(this.formatFileTooltip(file.path, preview), x, y);
          }
        });
      } else if (this.listScope) {
        this.listScope.on(item, 'mouseenter', async (e: Event) => {
          const preview = await this.fetchFilePreview(source, file.path);
          if (preview) {
            this.showTooltip(
              this.formatFileTooltip(file.path, preview),
              (e as MouseEvent).clientX,
              (e as MouseEvent).clientY
            );
          }
        });

        this.listScope.on(item, 'mousemove', (e: Event) => {
          if (this.tooltipElement?.style.display === 'block') {
            this.repositionTooltip((e as MouseEvent).clientX, (e as MouseEvent).clientY);
          }
        });

        this.listScope.on(item, 'mouseleave', () => {
          this.hideTooltip();
        });
      }

      item.appendChild(checkbox);
      item.appendChild(content);
      container.appendChild(item);
    });
  }

  /**
   * Render git diff
   */
  private renderGitDiff(container: HTMLElement): void {
    if (!this.gitDiff || this.gitDiff.files.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'tui-quote-empty';
      emptyDiv.textContent = this.gitDiff?.summary || 'Git の変更が見つかりません';
      container.replaceChildren(emptyDiv);
      return;
    }

    // Full diff option
    const fullDiffItem = document.createElement('label');
    fullDiffItem.className = 'tui-quote-item tui-quote-full-diff';

    const fullDiffCheckbox = document.createElement('input');
    fullDiffCheckbox.type = 'checkbox';
    fullDiffCheckbox.checked = this.selectFullDiff;
    // biome-ignore lint: cleaned up via Mountable lifecycle
    fullDiffCheckbox.addEventListener('change', () => {
      this.selectFullDiff = fullDiffCheckbox.checked;
      if (this.selectFullDiff) {
        this.selectedGitFiles.clear();
        // Disable individual file checkboxes
        container.querySelectorAll('.tui-quote-git-file input').forEach((cb) => {
          (cb as HTMLInputElement).checked = false;
          (cb as HTMLInputElement).disabled = true;
        });
      } else {
        container.querySelectorAll('.tui-quote-git-file input').forEach((cb) => {
          (cb as HTMLInputElement).disabled = false;
        });
      }
      this.updateSelectionInfo();
    });

    const fullDiffContent = document.createElement('div');
    fullDiffContent.className = 'tui-quote-item-content';

    const fullDiffHeader = document.createElement('div');
    fullDiffHeader.className = 'tui-quote-item-header';

    const fullDiffTitle = document.createElement('span');
    fullDiffTitle.className = 'tui-quote-item-title';
    fullDiffTitle.textContent = 'Full diff';

    const fullDiffMeta = document.createElement('span');
    fullDiffMeta.className = 'tui-quote-item-meta';
    fullDiffMeta.textContent = this.gitDiff.summary;

    fullDiffHeader.appendChild(fullDiffTitle);
    fullDiffHeader.appendChild(fullDiffMeta);
    fullDiffContent.appendChild(fullDiffHeader);

    fullDiffItem.appendChild(fullDiffCheckbox);
    fullDiffItem.appendChild(fullDiffContent);
    container.appendChild(fullDiffItem);

    // Individual files
    this.gitDiff.files.forEach((file) => {
      const item = document.createElement('label');
      item.className = 'tui-quote-item tui-quote-git-file';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selectedGitFiles.has(file.path);
      checkbox.disabled = this.selectFullDiff;
      // biome-ignore lint: cleaned up via Mountable lifecycle
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedGitFiles.add(file.path);
        } else {
          this.selectedGitFiles.delete(file.path);
        }
        this.updateSelectionInfo();
      });

      const content = document.createElement('div');
      content.className = 'tui-quote-item-content';

      const fileHeader = document.createElement('div');
      fileHeader.className = 'tui-quote-item-header';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'tui-quote-status-badge';
      statusBadge.textContent = file.status;

      const fileTitle = document.createElement('span');
      fileTitle.className = 'tui-quote-item-title';
      fileTitle.textContent = file.path;

      const diffStats = document.createElement('span');
      diffStats.className = 'tui-quote-diff-stats';

      const additions = document.createElement('span');
      additions.className = 'tui-quote-additions';
      additions.textContent = `+${file.additions}`;

      const deletions = document.createElement('span');
      deletions.className = 'tui-quote-deletions';
      deletions.textContent = `-${file.deletions}`;

      diffStats.appendChild(additions);
      diffStats.appendChild(deletions);
      fileHeader.appendChild(statusBadge);
      fileHeader.appendChild(fileTitle);
      fileHeader.appendChild(diffStats);
      content.appendChild(fileHeader);

      // Add hover tooltip for diff preview (PC) or long press (mobile)
      if (this.isMobile()) {
        this.setupLongPress(item, async (x, y) => {
          const preview = await this.fetchGitDiffPreview(file.path);
          if (preview) {
            this.showTooltip(this.formatDiffTooltip(file.path, preview), x, y);
          }
        });
      } else if (this.listScope) {
        this.listScope.on(item, 'mouseenter', async (e: Event) => {
          const preview = await this.fetchGitDiffPreview(file.path);
          if (preview) {
            this.showTooltip(
              this.formatDiffTooltip(file.path, preview),
              (e as MouseEvent).clientX,
              (e as MouseEvent).clientY
            );
          }
        });

        this.listScope.on(item, 'mousemove', (e: Event) => {
          if (this.tooltipElement?.style.display === 'block') {
            this.repositionTooltip((e as MouseEvent).clientX, (e as MouseEvent).clientY);
          }
        });

        this.listScope.on(item, 'mouseleave', () => {
          this.hideTooltip();
        });
      }

      item.appendChild(checkbox);
      item.appendChild(content);
      container.appendChild(item);
    });
  }

  /**
   * Render repomix tab
   */
  private renderRepomix(container: HTMLElement): void {
    // Directory input
    const inputGroup = document.createElement('div');
    inputGroup.className = 'tui-repomix-input-group';
    const label = document.createElement('label');
    label.className = 'tui-repomix-label';
    label.textContent = 'ディレクトリパス:';

    const inputRow = document.createElement('div');
    inputRow.className = 'tui-repomix-input-row';

    const inputEl = document.createElement('input');
    inputEl.type = 'text';
    inputEl.className = 'tui-repomix-input';
    inputEl.placeholder = '例: src/components';
    inputEl.value = this.repomixPath;

    const runBtnEl = document.createElement('button');
    runBtnEl.className = 'tui-repomix-run';
    runBtnEl.textContent = 'Pack';

    inputRow.appendChild(inputEl);
    inputRow.appendChild(runBtnEl);
    inputGroup.appendChild(label);
    inputGroup.appendChild(inputRow);

    // Input event to update state
    // biome-ignore lint: cleaned up via Mountable lifecycle
    inputEl.addEventListener('input', () => {
      this.repomixPath = inputEl.value;
    });

    // Run button
    // biome-ignore lint: cleaned up via Mountable lifecycle
    runBtnEl.addEventListener('click', async () => {
      if (!this.repomixPath.trim()) {
        this.repomixError = 'ディレクトリパスを入力してください';
        this.renderList();
        return;
      }
      await this.runRepomix();
    });

    // Allow Enter key to run
    // biome-ignore lint: cleaned up via Mountable lifecycle
    inputEl.addEventListener('keydown', async (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter' && this.repomixPath.trim()) {
        await this.runRepomix();
      }
    });

    container.appendChild(inputGroup);

    // Loading state
    if (this.repomixLoading) {
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'tui-repomix-loading';
      loadingDiv.textContent = '⏳ Repomix を実行中...';
      container.appendChild(loadingDiv);
      return;
    }

    // Error state
    if (this.repomixError) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'tui-repomix-error';
      errorDiv.textContent = this.repomixError;
      container.appendChild(errorDiv);
    }

    // Result
    if (this.repomixResult) {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'tui-repomix-result';

      const stats = document.createElement('div');
      stats.className = 'tui-repomix-stats';
      for (const text of [
        `📁 ${this.repomixResult.directory}`,
        `📄 ${this.repomixResult.fileCount} files`,
        `🔢 ${this.repomixResult.tokenCount.toLocaleString()} tokens`
      ]) {
        const span = document.createElement('span');
        span.textContent = text;
        stats.appendChild(span);
      }

      const preview = document.createElement('pre');
      preview.className = 'tui-repomix-preview';
      // Show first 500 chars as preview
      const previewText =
        this.repomixResult.content.length > 500
          ? `${this.repomixResult.content.slice(0, 500)}...`
          : this.repomixResult.content;
      preview.textContent = previewText;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'tui-repomix-copy';
      copyBtn.textContent = '📋 クリップボードにコピー';
      // biome-ignore lint: cleaned up via Mountable lifecycle
      copyBtn.addEventListener('click', async () => {
        if (this.repomixResult) {
          try {
            await navigator.clipboard.writeText(this.repomixResult.content);
            copyBtn.textContent = '✅ コピーしました!';
            setTimeout(() => {
              copyBtn.textContent = '📋 クリップボードにコピー';
            }, 2000);
          } catch {
            copyBtn.textContent = '❌ コピー失敗';
          }
        }
      });

      resultDiv.appendChild(stats);
      resultDiv.appendChild(preview);
      resultDiv.appendChild(copyBtn);
      container.appendChild(resultDiv);
    }
  }

  /**
   * Run repomix on the specified directory
   */
  private async runRepomix(): Promise<void> {
    const basePath = this.config.base_path;
    const sessionName = getSessionName(this.config);

    this.repomixLoading = true;
    this.repomixError = null;
    this.repomixResult = null;
    this.renderList();

    try {
      const data = await fetchJSON<RepomixResult | { error: string }>(
        `${basePath}/api/claude-quotes/repomix?session=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(this.repomixPath)}`
      );

      if (data && 'error' in data) {
        this.repomixError = data.error;
      } else if (data) {
        this.repomixResult = data;
      }
    } catch (error) {
      this.repomixError = `エラー: ${String(error)}`;
    } finally {
      this.repomixLoading = false;
      this.renderList();
    }
  }

  /**
   * Update selection info
   */
  private updateSelectionInfo(): void {
    if (!this.elements) {
      return;
    }

    const count =
      this.selectedTurnUuids.size +
      this.selectedFilePaths.size +
      this.selectedGitFiles.size +
      (this.selectFullDiff ? 1 : 0);

    if (count === 0) {
      this.elements.selectionInfo.textContent = '';
      this.elements.copyBtn.disabled = true;
    } else {
      const tokens = this.estimateTokens();
      this.elements.selectionInfo.textContent = `${count} 件選択 (${tokens})`;
      this.elements.copyBtn.disabled = false;
    }
  }

  /**
   * Estimate tokens
   */
  private estimateTokens(): string {
    const turnTokens = this.selectedTurnUuids.size * 500;
    const fileTokens = this.selectedFilePaths.size * 300;
    const gitTokens = this.selectFullDiff ? 2000 : this.selectedGitFiles.size * 200;
    const total = turnTokens + fileTokens + gitTokens;

    if (total < 1000) {
      return `~${total} tokens`;
    }
    return `~${(total / 1000).toFixed(1)}k tokens`;
  }

  /**
   * Select all items in current tab
   */
  private selectAll(): void {
    switch (this.activeTab) {
      case 'turns':
        this.selectedTurnUuids = new Set(this.turns.map((t) => t.uuid));
        break;
      case 'projectMd':
        this.projectMarkdown.forEach((f) => this.selectedFilePaths.add(`project:${f.path}`));
        break;
      case 'plans':
        this.plans.forEach((f) => this.selectedFilePaths.add(`plans:${f.path}`));
        break;
      case 'gitDiff':
        if (this.gitDiff && this.gitDiff.files.length > 0) {
          this.selectedGitFiles = new Set(this.gitDiff.files.map((f) => f.path));
          this.selectFullDiff = false;
        }
        break;
    }
    this.renderList();
  }

  /**
   * Clear selection in current tab
   */
  private clearSelection(): void {
    switch (this.activeTab) {
      case 'turns':
        this.selectedTurnUuids.clear();
        break;
      case 'projectMd':
        // Only clear project files
        for (const key of [...this.selectedFilePaths]) {
          if (key.startsWith('project:')) {
            this.selectedFilePaths.delete(key);
          }
        }
        break;
      case 'plans':
        // Only clear plans files
        for (const key of [...this.selectedFilePaths]) {
          if (key.startsWith('plans:')) {
            this.selectedFilePaths.delete(key);
          }
        }
        break;
      case 'gitDiff': {
        this.selectedGitFiles.clear();
        this.selectFullDiff = false;
        break;
      }
    }
    this.renderList();
  }

  /**
   * Copy selected items to clipboard
   */
  private async copyToClipboard(): Promise<void> {
    if (!this.elements) {
      return;
    }

    const basePath = this.config.base_path;
    const sessionName = getSessionName(this.config);
    const parts: string[] = [];

    this.elements.copyBtn.disabled = true;
    this.elements.copyBtn.textContent = 'コピー中...';

    try {
      // Collect Claude assistant responses
      if (this.selectedTurnUuids.size > 0 && this.selectedClaudeSession) {
        parts.push('## Claude Code\n');

        for (const uuid of this.selectedTurnUuids) {
          const turn = await fetchJSON<ClaudeTurnFull>(
            `${basePath}/api/claude-quotes/turn/${encodeURIComponent(uuid)}?claudeSessionId=${encodeURIComponent(this.selectedClaudeSession.sessionId)}&projectPath=${encodeURIComponent(this.selectedClaudeSession.projectPath)}`
          );
          if (turn) {
            // Only include assistant content
            parts.push(turn.assistantContent);

            if (turn.toolUses.length > 0) {
              const toolNames = turn.toolUses.map((t) => {
                if (t.name === 'Edit' || t.name === 'Write') {
                  const path = (t.input?.file_path || t.input?.path || '') as string;
                  return `${t.name} (${path})`;
                }
                return t.name;
              });
              parts.push('');
              parts.push(`[Used tools: ${toolNames.join(', ')}]`);
            }

            parts.push('');
            parts.push('---');
            parts.push('');
          }
        }
      }

      // Collect files
      if (this.selectedFilePaths.size > 0) {
        for (const key of this.selectedFilePaths) {
          const [source = '', ...pathParts] = key.split(':');
          const path = pathParts.join(':');

          const data = await fetchJSON<{
            content: string;
            truncated?: boolean;
            totalLines?: number;
          }>(
            `${basePath}/api/claude-quotes/file-content?source=${source}&path=${encodeURIComponent(path)}&session=${encodeURIComponent(sessionName)}`
          );
          if (data) {
            const headerLabels: Record<string, string> = {
              project: 'Project',
              plans: 'Plan'
            };
            parts.push(`## ${headerLabels[source] || source}: ${path}\n`);
            parts.push('```markdown');
            parts.push(data.content);
            if (data.truncated) {
              parts.push(`\n... [truncated, ${data.totalLines} total lines]`);
            }
            parts.push('```');
            parts.push('');
          }
        }
      }

      // Collect git diff
      if (this.selectFullDiff && this.gitDiff?.fullDiff) {
        parts.push('## Git Diff\n');
        parts.push(`Summary: ${this.gitDiff.summary}\n`);
        parts.push('```diff');
        parts.push(this.gitDiff.fullDiff);
        parts.push('```');
        parts.push('');
      } else if (this.selectedGitFiles.size > 0) {
        parts.push('## Git Diff\n');

        for (const filePath of this.selectedGitFiles) {
          const data = await fetchJSON<{ path: string; diff: string }>(
            `${basePath}/api/claude-quotes/git-diff-file?session=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(filePath)}`
          );
          if (data) {
            parts.push(`### ${data.path}\n`);
            parts.push('```diff');
            parts.push(data.diff);
            parts.push('```');
            parts.push('');
          }
        }
      }

      if (parts.length > 0) {
        await navigator.clipboard.writeText(parts.join('\n'));
        this.elements.copyBtn.textContent = 'コピーしました!';
        setTimeout(() => {
          this.close();
        }, 800);
      }
    } catch (_error) {
      this.elements.copyBtn.textContent = 'エラー';
    } finally {
      setTimeout(() => {
        if (this.elements) {
          this.elements.copyBtn.textContent = 'コピー';
          this.elements.copyBtn.disabled = false;
        }
      }, 1000);
    }
  }

  /**
   * Format assistant response for tooltip
   */
  private formatTurnTooltip(turn: ClaudeTurnSummary): HTMLElement {
    const wrapper = document.createElement('div');

    const assistantDiv = document.createElement('div');
    assistantDiv.style.marginBottom = '2px';
    const assistantSpan = document.createElement('span');
    assistantSpan.style.color = '#e0e0e0';
    assistantSpan.textContent = turn.assistantSummary;
    assistantDiv.appendChild(assistantSpan);
    wrapper.appendChild(assistantDiv);

    if (turn.hasToolUse || (turn.editedFiles && turn.editedFiles.length > 0)) {
      const tools =
        turn.editedFiles && turn.editedFiles.length > 0
          ? `Edited: ${turn.editedFiles.join(', ')}`
          : 'Used tools';
      const metaDiv = document.createElement('div');
      Object.assign(metaDiv.style, { color: '#888', fontSize: '9px', marginTop: '4px' });
      metaDiv.textContent = `🔧 ${tools}`;
      wrapper.appendChild(metaDiv);
    }

    const timeDiv = document.createElement('div');
    Object.assign(timeDiv.style, { color: '#666', fontSize: '9px', marginTop: '4px' });
    timeDiv.textContent = formatRelativeTime(turn.timestamp, 'en');
    wrapper.appendChild(timeDiv);

    return wrapper;
  }

  /**
   * Fetch file content preview (first N lines)
   */
  private async fetchFilePreview(source: string, path: string): Promise<string | null> {
    const basePath = this.config.base_path;
    const sessionName = getSessionName(this.config);
    const url = `${basePath}/api/claude-quotes/file-content?source=${source}&path=${encodeURIComponent(path)}&session=${encodeURIComponent(sessionName)}&preview=true`;
    const data = await fetchJSON<{ content?: string }>(url);
    return data?.content ?? null;
  }

  /**
   * Fetch git diff preview for a file
   */
  private async fetchGitDiffPreview(filePath: string): Promise<string | null> {
    const basePath = this.config.base_path;
    const sessionName = getSessionName(this.config);
    const url = `${basePath}/api/claude-quotes/git-diff-file?session=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(filePath)}`;
    const data = await fetchJSON<{ diff?: string }>(url);
    if (!data?.diff) return null;
    // Truncate to first 30 lines for preview
    const lines = data.diff.split('\n').slice(0, 30);
    if (lines.length === 30) {
      lines.push('...');
    }
    return lines.join('\n');
  }

  /**
   * Format file content for tooltip
   */
  private formatFileTooltip(path: string, content: string): HTMLElement {
    const truncated = content.length > 1000 ? `${content.slice(0, 1000)}...` : content;

    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      fontFamily: 'monospace',
      fontSize: '11px',
      maxHeight: '400px',
      overflow: 'hidden'
    });

    const pathDiv = document.createElement('div');
    Object.assign(pathDiv.style, { color: '#00d9ff', marginBottom: '4px', fontWeight: 'bold' });
    pathDiv.textContent = path;

    const contentDiv = document.createElement('div');
    Object.assign(contentDiv.style, { color: '#e0e0e0', whiteSpace: 'pre-wrap' });
    contentDiv.textContent = truncated;

    wrapper.appendChild(pathDiv);
    wrapper.appendChild(contentDiv);
    return wrapper;
  }

  /**
   * Format diff for tooltip
   */
  private formatDiffTooltip(path: string, diff: string): HTMLElement {
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, {
      fontFamily: 'monospace',
      fontSize: '11px',
      maxHeight: '400px',
      overflow: 'hidden'
    });

    const pathDiv = document.createElement('div');
    Object.assign(pathDiv.style, { color: '#00d9ff', marginBottom: '4px', fontWeight: 'bold' });
    pathDiv.textContent = path;
    wrapper.appendChild(pathDiv);

    const diffDiv = document.createElement('div');
    diffDiv.style.whiteSpace = 'pre-wrap';

    for (const line of diff.split('\n')) {
      const span = document.createElement('span');
      span.textContent = `${line}\n`;
      if (line.startsWith('+') && !line.startsWith('+++')) {
        span.style.color = '#4caf50';
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        span.style.color = '#f44336';
      } else if (line.startsWith('@@')) {
        span.style.color = '#00d9ff';
      }
      diffDiv.appendChild(span);
    }

    wrapper.appendChild(diffDiv);
    return wrapper;
  }

  /**
   * Setup long press handler for mobile preview
   */
  private setupLongPress(element: HTMLElement, onLongPress: (x: number, y: number) => void): void {
    if (!this.listScope) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let touchX = 0;
    let touchY = 0;

    this.listScope.on(element, 'touchstart', (e: Event) => {
      const touch = (e as TouchEvent).touches[0];
      if (!touch) return;
      touchX = touch.clientX;
      touchY = touch.clientY;

      timer = setTimeout(() => {
        onLongPress(touchX, touchY);
      }, 500); // 500ms long press
    });

    this.listScope.on(element, 'touchend', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // Hide tooltip after a delay when touch ends
      setTimeout(() => this.hideTooltip(), 100);
    });

    this.listScope.on(element, 'touchmove', (e: Event) => {
      // Cancel if moved too far
      const touch = (e as TouchEvent).touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - touchX);
      const dy = Math.abs(touch.clientY - touchY);
      if (dx > 10 || dy > 10) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      }
    });

    this.listScope.on(element, 'touchcancel', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      this.hideTooltip();
    });
  }

  /**
   * Check if running on mobile device
   */
  private isMobile(): boolean {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
}
