/**
 * AI Session Manager Tests
 */

import { afterEach, describe, expect, test } from 'bun:test';
import {
  AISessionManager,
  DEFAULT_SNAPSHOT_CONFIG,
  IdempotencyStore,
  createContextSnapshot,
  resetAISessionManager
} from './ai-session.js';

describe('IdempotencyStore', () => {
  test('creates new entries', () => {
    const store = new IdempotencyStore();

    const { entry, isNew } = store.getOrCreate('key1');
    expect(isNew).toBe(true);
    expect(entry.status).toBe('pending');
    expect(entry.idempotencyKey).toBe('key1');

    store.dispose();
  });

  test('returns existing entries', () => {
    const store = new IdempotencyStore();

    const first = store.getOrCreate('key1');
    const second = store.getOrCreate('key1');

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(first.entry.runId).toBe(second.entry.runId);

    store.dispose();
  });

  test('updates status', () => {
    const store = new IdempotencyStore();

    const { entry } = store.getOrCreate('key1');
    store.markRunning(entry.runId);

    const updated = store.getByRunId(entry.runId);
    expect(updated?.status).toBe('running');

    store.dispose();
  });

  test('marks completed with result', () => {
    const store = new IdempotencyStore();

    const { entry } = store.getOrCreate('key1');
    store.markCompleted(entry.runId, {
      content: 'Test response',
      citations: [],
      nextCommands: []
    });

    const updated = store.getByRunId(entry.runId);
    expect(updated?.status).toBe('completed');
    expect(updated?.result?.content).toBe('Test response');

    store.dispose();
  });

  test('cancels running entries', () => {
    const store = new IdempotencyStore();

    const { entry } = store.getOrCreate('key1');
    store.markRunning(entry.runId);

    const canceled = store.cancel(entry.runId);
    expect(canceled).toBe(true);

    const updated = store.getByRunId(entry.runId);
    expect(updated?.status).toBe('canceled');
    expect(updated?.error).toBe('user_canceled');

    store.dispose();
  });

  test('cannot cancel completed entries', () => {
    const store = new IdempotencyStore();

    const { entry } = store.getOrCreate('key1');
    store.markCompleted(entry.runId, { content: '', citations: [], nextCommands: [] });

    const canceled = store.cancel(entry.runId);
    expect(canceled).toBe(false);

    store.dispose();
  });

  test('emits timeout event for stale runs', async () => {
    const store = new IdempotencyStore({
      maxRunDuration: 100, // 100ms
      watchdogInterval: 50 // 50ms
    });

    const { entry } = store.getOrCreate('key1');
    store.markRunning(entry.runId);

    const timeoutPromise = new Promise<string>((resolve) => {
      store.on('run_timeout', (runId: string) => resolve(runId));
    });

    // Wait for watchdog to trigger
    const timedOutRunId = await Promise.race([
      timeoutPromise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500))
    ]);

    expect(timedOutRunId).toBe(entry.runId);

    const updated = store.getByRunId(entry.runId);
    expect(updated?.status).toBe('timeout');

    store.dispose();
  });

  test('getStats returns correct counts', () => {
    const store = new IdempotencyStore();

    store.getOrCreate('key1');
    store.getOrCreate('key2');
    const { entry: entry3 } = store.getOrCreate('key3');
    store.markRunning(entry3.runId);
    const { entry: entry4 } = store.getOrCreate('key4');
    store.markCompleted(entry4.runId, { content: '', citations: [], nextCommands: [] });

    const stats = store.getStats();
    expect(stats.total).toBe(4);
    expect(stats.pending).toBe(2);
    expect(stats.running).toBe(1);
    expect(stats.completed).toBe(1);

    store.dispose();
  });
});

describe('createContextSnapshot', () => {
  test('takes most recent blocks', () => {
    const blocks = Array.from({ length: 20 }, (_, i) => ({
      id: `block_${i}`,
      command: `cmd ${i}`,
      output: `output ${i}`,
      status: 'success' as const
    }));

    const snapshot = createContextSnapshot(blocks, {
      ...DEFAULT_SNAPSHOT_CONFIG,
      maxBlockCount: 5
    });

    expect(snapshot.length).toBe(5);
    expect(snapshot[0].id).toBe('block_15');
    expect(snapshot[4].id).toBe('block_19');
  });

  test('truncates output per block', () => {
    const blocks = [
      {
        id: 'block_1',
        command: 'cmd',
        output: 'x'.repeat(20000),
        status: 'success' as const
      }
    ];

    const snapshot = createContextSnapshot(blocks, {
      ...DEFAULT_SNAPSHOT_CONFIG,
      maxContentPerBlock: 1000
    });

    expect(snapshot[0].outputPreview.length).toBe(1000);
  });

  test('respects total size limit', () => {
    const blocks = Array.from({ length: 10 }, (_, i) => ({
      id: `block_${i}`,
      command: 'cmd',
      output: 'x'.repeat(5000),
      status: 'success' as const
    }));

    const snapshot = createContextSnapshot(blocks, {
      maxBlockCount: 10,
      maxContentPerBlock: 10000,
      maxTotalSize: 10000
    });

    // Should have fewer blocks due to size limit
    expect(snapshot.length).toBeLessThan(10);

    const totalSize = snapshot.reduce(
      (sum, b) => sum + b.command.length + b.outputPreview.length,
      0
    );
    expect(totalSize).toBeLessThanOrEqual(10000);
  });

  test('maps status correctly', () => {
    const blocks = [
      {
        id: 'block_1',
        command: 'cmd',
        status: 'error' as const,
        exitCode: 1
      }
    ];

    const snapshot = createContextSnapshot(blocks);

    expect(snapshot[0].status).toBe('error');
    expect(snapshot[0].exitCode).toBe(1);
  });
});

describe('AISessionManager', () => {
  afterEach(() => {
    resetAISessionManager();
  });

  test('creates sessions on demand', () => {
    const manager = new AISessionManager();

    const session = manager.getOrCreateSession('test-session', 'claude');

    expect(session.sessionName).toBe('test-session');
    expect(session.runner).toBe('claude');
    expect(session.currentRunId).toBeNull();

    manager.dispose();
  });

  test('reuses existing sessions', () => {
    const manager = new AISessionManager();

    const first = manager.getOrCreateSession('test-session');
    const second = manager.getOrCreateSession('test-session');

    expect(first.id).toBe(second.id);

    manager.dispose();
  });

  test('starts runs with idempotency', () => {
    const manager = new AISessionManager();

    const first = manager.startRun('test-session', 'idem-key-1');
    expect(first.isNew).toBe(true);

    const second = manager.startRun('test-session', 'idem-key-1');
    expect(second.isNew).toBe(false);
    expect(second.runId).toBe(first.runId);

    manager.dispose();
  });

  test('tracks current run in session', () => {
    const manager = new AISessionManager();

    const { runId } = manager.startRun('test-session', 'idem-key-1');

    const session = manager.getSession('test-session');
    expect(session?.currentRunId).toBe(runId);

    manager.dispose();
  });

  test('clears current run on completion', () => {
    const manager = new AISessionManager();

    const { runId } = manager.startRun('test-session', 'idem-key-1');
    manager.completeRun(runId, { content: '', citations: [], nextCommands: [] });

    const session = manager.getSession('test-session');
    expect(session?.currentRunId).toBeNull();

    manager.dispose();
  });

  test('increments stream sequence', () => {
    const manager = new AISessionManager();
    manager.startRun('test-session', 'idem-key-1');

    const seq1 = manager.getNextStreamSeq('test-session');
    const seq2 = manager.getNextStreamSeq('test-session');
    const seq3 = manager.getNextStreamSeq('test-session');

    expect(seq1).toBe(0);
    expect(seq2).toBe(1);
    expect(seq3).toBe(2);

    manager.dispose();
  });

  test('resets sequence on new run', () => {
    const manager = new AISessionManager();

    manager.startRun('test-session', 'idem-key-1');
    manager.getNextStreamSeq('test-session');
    manager.getNextStreamSeq('test-session');

    const { runId } = manager.startRun('test-session', 'idem-key-1');
    manager.completeRun(runId, { content: '', citations: [], nextCommands: [] });

    // New run
    manager.startRun('test-session', 'idem-key-2');
    const seq = manager.getNextStreamSeq('test-session');
    expect(seq).toBe(0);

    manager.dispose();
  });
});
