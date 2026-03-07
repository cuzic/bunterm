/**
 * Quote Manager
 *
 * Manages the Quote to Clipboard modal for copying content to another AI.
 * Supports 4 tabs: Claude Turns, Project Markdown, Plans, Git Diff
 */

import type {
  ClaudeSessionInfo,
  ClaudeTurnFull,
  ClaudeTurnSummary,
  GitDiffResponse,
  MarkdownFile
} from '../../native-terminal/claude-quotes/types.js';
import { type Mountable, type Scope, on } from './lifecycle.js';
import type { TerminalUiConfig } from './types.js';
import { bindClickScoped } from './utils.js';

// Types
type QuoteTab = 'turns' | 'projectMd' | 'plans' | 'gitDiff';

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

  // Tooltip
  private tooltipElement: HTMLElement | null = null;
  private tooltipTimeout: ReturnType<typeof setTimeout> | null = null;

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
  private showTooltip(content: string, x: number, y: number): void {
    if (!this.tooltipElement) return;

    // Clear any pending hide
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    this.tooltipElement.innerHTML = content;
    this.tooltipElement.style.display = 'block';

    // Position tooltip
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
    if (!this.tooltipElement) return;

    this.tooltipTimeout = setTimeout(() => {
      if (this.tooltipElement) {
        this.tooltipElement.style.display = 'none';
      }
    }, 100);
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
      scope.add(
        on(btn, 'click', () => {
          const tab = (btn as HTMLElement).dataset['tab'] as QuoteTab;
          if (tab) {
            this.switchTab(tab);
          }
        })
      );
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
    scope.add(
      on(elements.modal, 'click', (e: Event) => {
        if (e.target === elements.modal) {
          this.close();
        }
      })
    );
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
    if (!this.elements) return;

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
    if (!this.elements) return;

    this.elements.modal.classList.add('hidden');
    this.isOpen = false;
  }

  /**
   * Switch tab
   */
  private switchTab(tab: QuoteTab): void {
    if (!this.elements) return;

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
    const sessionName = this.getSessionName();

    // First, fetch Claude sessions from history.jsonl
    await this.fetchClaudeSessions(basePath);

    // Auto-select based on current project name (from URL path)
    if (this.claudeSessions.length > 0 && !this.selectedClaudeSession) {
      // Try to find a session matching the current project name
      const matchingSession = this.claudeSessions.find(
        (s) => s.projectName === sessionName || s.projectPath.endsWith(`/${sessionName}`)
      );
      this.selectedClaudeSession = matchingSession || this.claudeSessions[0];
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
   * Get session name from URL
   */
  private getSessionName(): string {
    const basePath = this.config.base_path;
    const path = window.location.pathname;

    if (path.startsWith(basePath)) {
      const remainder = path.slice(basePath.length);
      const segments = remainder.split('/').filter((s) => s.length > 0);
      if (segments.length > 0) {
        return decodeURIComponent(segments[0]);
      }
    }

    return 'default';
  }

  /**
   * Fetch Claude sessions from history.jsonl
   */
  private async fetchClaudeSessions(basePath: string): Promise<void> {
    try {
      const response = await fetch(`${basePath}/api/claude-quotes/sessions?limit=10`);
      if (response.ok) {
        const data = await response.json();
        this.claudeSessions = data.sessions || [];
      }
    } catch (error) {
      console.error('Failed to fetch Claude sessions:', error);
      this.claudeSessions = [];
    }
  }

  /**
   * Fetch Claude turns
   */
  private async fetchTurns(basePath: string): Promise<void> {
    if (!this.selectedClaudeSession) {
      this.turns = [];
      return;
    }

    try {
      const response = await fetch(
        `${basePath}/api/claude-quotes/recent?claudeSessionId=${encodeURIComponent(this.selectedClaudeSession.sessionId)}&projectPath=${encodeURIComponent(this.selectedClaudeSession.projectPath)}&count=20`
      );
      if (response.ok) {
        const data = await response.json();
        this.turns = data.turns || [];
      } else {
        this.turns = [];
      }
    } catch (error) {
      console.error('Failed to fetch Claude turns:', error);
      this.turns = [];
    }
  }

  /**
   * Fetch project markdown files
   */
  private async fetchProjectMarkdown(basePath: string, sessionName: string): Promise<void> {
    try {
      const response = await fetch(
        `${basePath}/api/claude-quotes/project-markdown?session=${encodeURIComponent(sessionName)}&count=10`
      );
      if (response.ok) {
        const data = await response.json();
        this.projectMarkdown = data.files || [];
      }
    } catch (error) {
      console.error('Failed to fetch project markdown:', error);
      this.projectMarkdown = [];
    }
  }

  /**
   * Fetch plan files
   */
  private async fetchPlans(basePath: string): Promise<void> {
    try {
      const response = await fetch(`${basePath}/api/claude-quotes/plans?count=10`);
      if (response.ok) {
        const data = await response.json();
        this.plans = data.files || [];
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
      this.plans = [];
    }
  }

  /**
   * Fetch git diff
   */
  private async fetchGitDiff(basePath: string, sessionName: string): Promise<void> {
    try {
      const response = await fetch(
        `${basePath}/api/claude-quotes/git-diff?session=${encodeURIComponent(sessionName)}`
      );
      if (response.ok) {
        this.gitDiff = await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch git diff:', error);
      this.gitDiff = null;
    }
  }

  /**
   * Render list based on active tab
   */
  private renderList(): void {
    if (!this.elements) return;

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
        const relTime = this.formatRelativeTime(new Date(session.lastTimestamp).toISOString());
        option.textContent = `${session.projectName} (${relTime})`;
        if (this.selectedClaudeSession?.sessionId === session.sessionId) {
          option.selected = true;
        }
        select.appendChild(option);
      });

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
          ? turn.assistantSummary.slice(0, 150) + '...'
          : turn.assistantSummary;
      header.innerHTML = `
        <span class="tui-quote-item-title">${this.escapeHtml(displayText)}</span>
        <span class="tui-quote-item-time">${this.formatRelativeTime(turn.timestamp)}</span>
      `;

      content.appendChild(header);

      if (turn.hasToolUse) {
        const meta = document.createElement('div');
        meta.className = 'tui-quote-item-meta';
        meta.textContent = turn.editedFiles?.length
          ? `Edited: ${turn.editedFiles.join(', ')}`
          : 'Used tools';
        content.appendChild(meta);
      }

      // Add hover tooltip for full content preview
      item.addEventListener('mouseenter', (e) => {
        const tooltipContent = this.formatTurnTooltip(turn);
        this.showTooltip(tooltipContent, e.clientX, e.clientY);
      });

      item.addEventListener('mousemove', (e) => {
        // Update tooltip position as mouse moves
        if (this.tooltipElement?.style.display === 'block') {
          this.showTooltip(this.tooltipElement.innerHTML, e.clientX, e.clientY);
        }
      });

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
      container.innerHTML = `<div class="tui-quote-empty">${source === 'project' ? 'プロジェクト内' : ''}マークダウンファイルが見つかりません</div>`;
      return;
    }

    files.forEach((file) => {
      const key = `${source}:${file.path}`;
      const item = document.createElement('label');
      item.className = 'tui-quote-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = this.selectedFilePaths.has(key);
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
      header.innerHTML = `
        <span class="tui-quote-item-title">${this.escapeHtml(file.path)}</span>
        <span class="tui-quote-item-time">${this.formatRelativeTime(file.modifiedAt)}</span>
      `;

      const meta = document.createElement('div');
      meta.className = 'tui-quote-item-meta';
      meta.textContent = `${(file.size / 1024).toFixed(1)} KB`;

      content.appendChild(header);
      content.appendChild(meta);

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
      container.innerHTML = `<div class="tui-quote-empty">${this.gitDiff?.summary || 'Git の変更が見つかりません'}</div>`;
      return;
    }

    // Full diff option
    const fullDiffItem = document.createElement('label');
    fullDiffItem.className = 'tui-quote-item tui-quote-full-diff';

    const fullDiffCheckbox = document.createElement('input');
    fullDiffCheckbox.type = 'checkbox';
    fullDiffCheckbox.checked = this.selectFullDiff;
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
    fullDiffContent.innerHTML = `
      <div class="tui-quote-item-header">
        <span class="tui-quote-item-title">Full diff</span>
        <span class="tui-quote-item-meta">${this.gitDiff.summary}</span>
      </div>
    `;

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
      content.innerHTML = `
        <div class="tui-quote-item-header">
          <span class="tui-quote-status-badge">${file.status}</span>
          <span class="tui-quote-item-title">${this.escapeHtml(file.path)}</span>
          <span class="tui-quote-diff-stats">
            <span class="tui-quote-additions">+${file.additions}</span>
            <span class="tui-quote-deletions">-${file.deletions}</span>
          </span>
        </div>
      `;

      item.appendChild(checkbox);
      item.appendChild(content);
      container.appendChild(item);
    });
  }

  /**
   * Update selection info
   */
  private updateSelectionInfo(): void {
    if (!this.elements) return;

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

    if (total < 1000) return `~${total} tokens`;
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
        if (this.gitDiff?.files.length) {
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
      case 'gitDiff':
        this.selectedGitFiles.clear();
        this.selectFullDiff = false;
        break;
    }
    this.renderList();
  }

  /**
   * Copy selected items to clipboard
   */
  private async copyToClipboard(): Promise<void> {
    if (!this.elements) return;

    const basePath = this.config.base_path;
    const sessionName = this.getSessionName();
    const parts: string[] = [];

    this.elements.copyBtn.disabled = true;
    this.elements.copyBtn.textContent = 'コピー中...';

    try {
      // Collect Claude assistant responses
      if (this.selectedTurnUuids.size > 0 && this.selectedClaudeSession) {
        parts.push('## Claude Code\n');

        for (const uuid of this.selectedTurnUuids) {
          try {
            const response = await fetch(
              `${basePath}/api/claude-quotes/turn/${encodeURIComponent(uuid)}?claudeSessionId=${encodeURIComponent(this.selectedClaudeSession.sessionId)}&projectPath=${encodeURIComponent(this.selectedClaudeSession.projectPath)}`
            );
            if (response.ok) {
              const turn: ClaudeTurnFull = await response.json();

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
          } catch (error) {
            console.error(`Failed to fetch turn ${uuid}:`, error);
          }
        }
      }

      // Collect files
      if (this.selectedFilePaths.size > 0) {
        for (const key of this.selectedFilePaths) {
          const [source, ...pathParts] = key.split(':');
          const path = pathParts.join(':');

          try {
            const response = await fetch(
              `${basePath}/api/claude-quotes/file-content?source=${source}&path=${encodeURIComponent(path)}&session=${encodeURIComponent(sessionName)}`
            );
            if (response.ok) {
              const data = await response.json();

              parts.push(`## ${source === 'plans' ? 'Plan' : 'Project'}: ${path}\n`);
              parts.push('```markdown');
              parts.push(data.content);
              if (data.truncated) {
                parts.push(`\n... [truncated, ${data.totalLines} total lines]`);
              }
              parts.push('```');
              parts.push('');
            }
          } catch (error) {
            console.error(`Failed to fetch file ${path}:`, error);
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
          try {
            const response = await fetch(
              `${basePath}/api/claude-quotes/git-diff-file?session=${encodeURIComponent(sessionName)}&path=${encodeURIComponent(filePath)}`
            );
            if (response.ok) {
              const data = await response.json();
              parts.push(`### ${data.path}\n`);
              parts.push('```diff');
              parts.push(data.diff);
              parts.push('```');
              parts.push('');
            }
          } catch (error) {
            console.error(`Failed to fetch diff for ${filePath}:`, error);
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
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
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
   * Format relative time
   */
  private formatRelativeTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
  }

  /**
   * Format assistant response for tooltip
   */
  private formatTurnTooltip(turn: ClaudeTurnSummary): string {
    const assistantSection = `<div style="margin-bottom: 2px;">
      <span style="color: #e0e0e0;">${this.escapeHtml(turn.assistantSummary)}</span>
    </div>`;

    let metaSection = '';
    if (turn.hasToolUse || turn.editedFiles?.length) {
      const tools = turn.editedFiles?.length
        ? `Edited: ${turn.editedFiles.join(', ')}`
        : 'Used tools';
      metaSection = `<div style="color: #888; font-size: 9px; margin-top: 4px;">🔧 ${this.escapeHtml(tools)}</div>`;
    }

    const timeSection = `<div style="color: #666; font-size: 9px; margin-top: 4px;">${this.formatRelativeTime(turn.timestamp)}</div>`;

    return assistantSection + metaSection + timeSection;
  }

  /**
   * Escape HTML
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
