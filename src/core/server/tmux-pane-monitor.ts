/**
 * TmuxPaneMonitor - Monitors tmux pane count changes via polling
 *
 * Polls `tmux list-panes` at a configurable interval and notifies
 * subscribers when the pane count changes.
 */

import { defaultProcessRunner, type ProcessRunner } from '@/utils/process-runner.js';
import { isValidSessionName } from '@/utils/tmux-client.js';

export interface TmuxPaneInfo {
  paneId: string;
  currentCommand: string;
  title: string;
}

const PANE_FORMAT = '#{pane_id}|#{pane_current_command}|#{pane_title}';
const DEFAULT_INTERVAL_MS = 5000;

type PaneCountChangeCallback = (count: number, panes: TmuxPaneInfo[]) => void;

export interface TmuxPaneMonitorOptions {
  processRunner?: ProcessRunner;
  intervalMs?: number;
}

/**
 * Parse tmux list-panes output into TmuxPaneInfo[]
 */
export function parsePaneOutput(output: string): TmuxPaneInfo[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [paneId = '', currentCommand = '', title = ''] = line.split('|');
      return { paneId, currentCommand, title };
    });
}

export class TmuxPaneMonitor {
  private readonly sessionName: string;
  private readonly intervalMs: number;
  private readonly processRunner: ProcessRunner;
  private readonly callbacks: Set<PaneCountChangeCallback> = new Set();
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private currentPanes: TmuxPaneInfo[] = [];

  constructor(sessionName: string, options: TmuxPaneMonitorOptions = {}) {
    if (!isValidSessionName(sessionName)) {
      throw new Error(`Invalid tmux session name: ${sessionName}`);
    }
    this.sessionName = sessionName;
    this.processRunner = options.processRunner ?? defaultProcessRunner;
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /**
   * Start polling for pane changes
   */
  start(): void {
    if (this.intervalHandle !== null) {
      return;
    }

    // Initial fetch
    this.currentPanes = this.fetchPanes();

    // Start polling
    this.intervalHandle = setInterval(() => {
      this.poll();
    }, this.intervalMs);
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Get current pane count
   */
  getPaneCount(): number {
    return this.currentPanes.length;
  }

  /**
   * Get current pane list
   */
  getPanes(): TmuxPaneInfo[] {
    return [...this.currentPanes];
  }

  /**
   * Subscribe to pane count changes. Returns unsubscribe function.
   */
  onPaneCountChange(callback: PaneCountChangeCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private poll(): void {
    const newPanes = this.fetchPanes();
    const oldCount = this.currentPanes.length;
    const newCount = newPanes.length;

    if (oldCount !== newCount) {
      this.currentPanes = newPanes;
      for (const cb of this.callbacks) {
        cb(newCount, [...newPanes]);
      }
    }
  }

  private fetchPanes(): TmuxPaneInfo[] {
    const result = this.processRunner.spawnSync(
      'tmux',
      ['list-panes', '-t', this.sessionName, '-F', PANE_FORMAT],
      { stdio: 'pipe' }
    );

    if (result.status !== 0) {
      return [];
    }

    return parsePaneOutput(result.stdout ?? '');
  }
}
