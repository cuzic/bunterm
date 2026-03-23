/**
 * TmuxPaneMonitor Tests
 *
 * Tests for tmux pane monitoring with polling-based change detection.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { createMockProcessRunner } from '@/utils/process-runner.js';
import { parsePaneOutput, TmuxPaneMonitor } from './tmux-pane-monitor.js';

describe('parsePaneOutput', () => {
  test('parses single pane output', () => {
    const output = '%0|bash|~/projects';
    const result = parsePaneOutput(output);
    expect(result).toEqual([{ paneId: '%0', currentCommand: 'bash', title: '~/projects' }]);
  });

  test('parses multiple pane output', () => {
    const output = '%0|bash|~/projects\n%1|vim|editor\n%2|node|server';
    const result = parsePaneOutput(output);
    expect(result).toEqual([
      { paneId: '%0', currentCommand: 'bash', title: '~/projects' },
      { paneId: '%1', currentCommand: 'vim', title: 'editor' },
      { paneId: '%2', currentCommand: 'node', title: 'server' }
    ]);
  });

  test('handles empty output', () => {
    expect(parsePaneOutput('')).toEqual([]);
  });

  test('handles whitespace-only output', () => {
    expect(parsePaneOutput('  \n  ')).toEqual([]);
  });

  test('handles partial fields gracefully', () => {
    const output = '%0|bash';
    const result = parsePaneOutput(output);
    expect(result).toEqual([{ paneId: '%0', currentCommand: 'bash', title: '' }]);
  });
});

describe('TmuxPaneMonitor', () => {
  let monitor: TmuxPaneMonitor;

  afterEach(() => {
    monitor?.stop();
  });

  test('initial pane count is 0 before start', () => {
    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: '%0|bash|~\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 100 });
    expect(monitor.getPaneCount()).toBe(0);
    expect(monitor.getPanes()).toEqual([]);
  });

  test('fetches panes on start', () => {
    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: '%0|bash|~\n%1|vim|editor\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 100 });
    monitor.start();

    expect(monitor.getPaneCount()).toBe(2);
    expect(monitor.getPanes()).toEqual([
      { paneId: '%0', currentCommand: 'bash', title: '~' },
      { paneId: '%1', currentCommand: 'vim', title: 'editor' }
    ]);
  });

  test('calls onPaneCountChange when pane count changes', async () => {
    let callCount = 0;
    const paneOutputs = ['%0|bash|~\n', '%0|bash|~\n%1|vim|editor\n'];
    let outputIndex = 0;

    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: paneOutputs[outputIndex] ?? '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });

    let resolvePromise: () => void;
    const callbackPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    const unsubscribe = monitor.onPaneCountChange((count, panes) => {
      callCount++;
      expect(count).toBe(2);
      expect(panes).toHaveLength(2);
      resolvePromise();
    });

    monitor.start();

    // Change output to 2 panes after initial fetch
    outputIndex = 1;

    await callbackPromise;
    expect(callCount).toBe(1);
    unsubscribe();
  });

  test('does not call callback when pane count stays the same', async () => {
    const callbackFn = mock(() => {});

    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: '%0|bash|~\n',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });
    monitor.onPaneCountChange(callbackFn);
    monitor.start();

    // Wait for a few poll cycles
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(callbackFn).not.toHaveBeenCalled();
  });

  test('stop clears interval and prevents further polling', async () => {
    let spawnCallCount = 0;

    const processRunner = createMockProcessRunner({
      spawnSync: () => {
        spawnCallCount++;
        return {
          status: 0,
          stdout: '%0|bash|~\n',
          stderr: '',
          pid: 0,
          output: [],
          signal: null
        };
      }
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });
    monitor.start();

    // Wait a bit then stop
    await new Promise((resolve) => setTimeout(resolve, 100));
    monitor.stop();
    const countAfterStop = spawnCallCount;

    // Wait more to confirm no additional calls
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(spawnCallCount).toBe(countAfterStop);
  });

  test('unsubscribe removes callback', async () => {
    const callbackFn = mock(() => {});
    const paneOutputs = ['%0|bash|~\n', '%0|bash|~\n%1|vim|editor\n'];
    let outputIndex = 0;

    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: paneOutputs[outputIndex] ?? '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });
    const unsubscribe = monitor.onPaneCountChange(callbackFn);
    unsubscribe(); // Unsubscribe immediately

    monitor.start();
    outputIndex = 1;

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(callbackFn).not.toHaveBeenCalled();
  });

  test('handles tmux command failure gracefully', () => {
    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 1,
        stdout: '',
        stderr: 'session not found',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('nonexistent', { processRunner, intervalMs: 100 });
    monitor.start();

    expect(monitor.getPaneCount()).toBe(0);
    expect(monitor.getPanes()).toEqual([]);
  });

  test('uses validated session name in tmux command', () => {
    const spawnSyncMock = mock(() => ({
      status: 0,
      stdout: '%0|bash|~\n',
      stderr: '',
      pid: 0,
      output: [],
      signal: null
    }));

    const processRunner = createMockProcessRunner({
      spawnSync: spawnSyncMock
    });

    monitor = new TmuxPaneMonitor('my-session', { processRunner, intervalMs: 100 });
    monitor.start();

    expect(spawnSyncMock).toHaveBeenCalledWith(
      'tmux',
      ['list-panes', '-t', 'my-session', '-F', '#{pane_id}|#{pane_current_command}|#{pane_title}'],
      { stdio: 'pipe' }
    );
  });

  test('detects pane count decrease', async () => {
    const paneOutputs = ['%0|bash|~\n%1|vim|editor\n%2|node|server\n', '%0|bash|~\n'];
    let outputIndex = 0;

    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: paneOutputs[outputIndex] ?? '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });

    let resolvePromise: () => void;
    const callbackPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    monitor.onPaneCountChange((count, panes) => {
      expect(count).toBe(1);
      expect(panes).toHaveLength(1);
      resolvePromise();
    });

    monitor.start();
    outputIndex = 1;

    await callbackPromise;
  });

  test('multiple subscribers all receive notifications', async () => {
    const paneOutputs = ['%0|bash|~\n', '%0|bash|~\n%1|vim|editor\n'];
    let outputIndex = 0;

    const processRunner = createMockProcessRunner({
      spawnSync: () => ({
        status: 0,
        stdout: paneOutputs[outputIndex] ?? '',
        stderr: '',
        pid: 0,
        output: [],
        signal: null
      })
    });

    monitor = new TmuxPaneMonitor('test-session', { processRunner, intervalMs: 50 });

    let count1 = 0;
    let count2 = 0;
    let resolvePromise: () => void;
    const bothCalled = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    monitor.onPaneCountChange(() => {
      count1++;
      if (count1 > 0 && count2 > 0) resolvePromise();
    });
    monitor.onPaneCountChange(() => {
      count2++;
      if (count1 > 0 && count2 > 0) resolvePromise();
    });

    monitor.start();
    outputIndex = 1;

    await bothCalled;
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});
