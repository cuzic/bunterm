/**
 * Tests for BlockEventEmitter
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import {
  type BlockEventEmitter,
  createBlockEventEmitter,
  formatSSEEvent
} from './block-event-emitter.js';
import type { BlockEvent, ExtendedBlock, OutputChunk } from './types.js';

describe('BlockEventEmitter', () => {
  let emitter: BlockEventEmitter;

  beforeEach(() => {
    emitter = createBlockEventEmitter();
  });

  describe('emit', () => {
    it('should emit events with sequential IDs', () => {
      const event1 = emitter.emit('block.started', 'block-1', { command: 'echo 1' });
      const event2 = emitter.emit('block.started', 'block-2', { command: 'echo 2' });

      expect(event1.seq).toBeLessThan(event2.seq);
    });

    it('should include timestamp', () => {
      const event = emitter.emit('block.started', 'block-1', { command: 'echo' });
      expect(event.timestamp).toBeDefined();
      expect(new Date(event.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include block ID and event type', () => {
      const event = emitter.emit('block.started', 'block-1', { command: 'echo' });
      expect(event.blockId).toBe('block-1');
      expect(event.type).toBe('block.started');
    });
  });

  describe('helper emit methods', () => {
    it('should emit queued event', () => {
      const block = createMockBlock('block-1');
      const event = emitter.emitQueued(block);

      expect(event.type).toBe('block.queued');
      expect(event.data.command).toBe('echo hello');
    });

    it('should emit started event', () => {
      const block = createMockBlock('block-1');
      const event = emitter.emitStarted(block);

      expect(event.type).toBe('block.started');
    });

    it('should emit stdout event', () => {
      const chunk = createMockChunk('block-1', 'stdout', 1);
      const event = emitter.emitStdout('block-1', chunk);

      expect(event.type).toBe('block.stdout');
      expect(event.data.stream).toBe('stdout');
    });

    it('should emit stderr event', () => {
      const chunk = createMockChunk('block-1', 'stderr', 2);
      const event = emitter.emitStderr('block-1', chunk);

      expect(event.type).toBe('block.stderr');
      expect(event.data.stream).toBe('stderr');
    });

    it('should emit completed event', () => {
      const block = createMockBlock('block-1');
      block.exitCode = 0;
      block.status = 'success';
      block.durationMs = 100;
      const event = emitter.emitCompleted(block);

      expect(event.type).toBe('block.completed');
      expect(event.data.exitCode).toBe(0);
      expect(event.data.status).toBe('success');
    });

    it('should emit canceled event', () => {
      const event = emitter.emitCanceled('block-1', 'SIGTERM');

      expect(event.type).toBe('block.canceled');
      expect(event.data.signal).toBe('SIGTERM');
    });

    it('should emit timeout event', () => {
      const event = emitter.emitTimeout('block-1', 5000);

      expect(event.type).toBe('block.timeout');
      expect(event.data.timeoutMs).toBe(5000);
    });
  });

  describe('subscribe', () => {
    it('should receive events for subscribed block', () => {
      const events: BlockEvent[] = [];
      emitter.subscribe('block-1', (event) => events.push(event));

      emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.started', 'block-2', {}); // Different block

      expect(events.length).toBe(1);
      expect(events[0].blockId).toBe('block-1');
    });

    it('should return unsubscribe function', () => {
      const events: BlockEvent[] = [];
      const unsubscribe = emitter.subscribe('block-1', (event) => events.push(event));

      emitter.emit('block.started', 'block-1', {});
      unsubscribe();
      emitter.emit('block.completed', 'block-1', {});

      expect(events.length).toBe(1);
    });

    it('should filter events by fromSeq', () => {
      // Emit some events first
      emitter.emit('block.started', 'block-1', {});
      const event2 = emitter.emit('block.stdout', 'block-1', {});

      const events: BlockEvent[] = [];
      emitter.subscribe('block-1', (event) => events.push(event), {
        fromSeq: event2.seq - 1,
        replayHistory: false // Don't replay, just filter new events
      });

      // This should be received
      emitter.emit('block.completed', 'block-1', {});

      expect(events.length).toBe(1);
    });

    it('should replay history when requested', () => {
      // Emit some events first
      emitter.emit('block.started', 'block-1', {});
      const event2 = emitter.emit('block.stdout', 'block-1', {});

      const events: BlockEvent[] = [];
      emitter.subscribe('block-1', (event) => events.push(event), {
        fromSeq: event2.seq - 2, // Include event2
        replayHistory: true
      });

      // Should receive event2 from history
      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('subscribeAll', () => {
    it('should receive events for all blocks', () => {
      const events: BlockEvent[] = [];
      emitter.subscribeAll((event) => events.push(event));

      emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.started', 'block-2', {});

      expect(events.length).toBe(2);
    });

    it('should return unsubscribe function', () => {
      const events: BlockEvent[] = [];
      const unsubscribe = emitter.subscribeAll((event) => events.push(event));

      emitter.emit('block.started', 'block-1', {});
      unsubscribe();
      emitter.emit('block.started', 'block-2', {});

      expect(events.length).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('should return event history for a block', () => {
      emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.stdout', 'block-1', {});
      emitter.emit('block.completed', 'block-1', {});

      const history = emitter.getHistory('block-1');
      expect(history.length).toBe(3);
    });

    it('should filter by fromSeq', () => {
      const event1 = emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.stdout', 'block-1', {});
      emitter.emit('block.completed', 'block-1', {});

      const history = emitter.getHistory('block-1', { fromSeq: event1.seq });
      expect(history.length).toBe(2);
    });

    it('should limit results', () => {
      for (let i = 0; i < 10; i++) {
        emitter.emit('block.stdout', 'block-1', {});
      }

      const history = emitter.getHistory('block-1', { limit: 5 });
      expect(history.length).toBe(5);
    });

    it('should return empty array for unknown block', () => {
      const history = emitter.getHistory('unknown-block');
      expect(history.length).toBe(0);
    });
  });

  describe('getCurrentSeq', () => {
    it('should return current sequence number', () => {
      expect(emitter.getCurrentSeq()).toBe(0);

      emitter.emit('block.started', 'block-1', {});
      expect(emitter.getCurrentSeq()).toBe(1);

      emitter.emit('block.stdout', 'block-1', {});
      expect(emitter.getCurrentSeq()).toBe(2);
    });
  });

  describe('getSubscriberCount', () => {
    it('should count subscribers for a block', () => {
      expect(emitter.getSubscriberCount('block-1')).toBe(0);

      const unsub1 = emitter.subscribe('block-1', () => {});
      expect(emitter.getSubscriberCount('block-1')).toBe(1);

      const unsub2 = emitter.subscribe('block-1', () => {});
      expect(emitter.getSubscriberCount('block-1')).toBe(2);

      unsub1();
      expect(emitter.getSubscriberCount('block-1')).toBe(1);

      unsub2();
      expect(emitter.getSubscriberCount('block-1')).toBe(0);
    });
  });

  describe('getTotalSubscriberCount', () => {
    it('should count all subscribers', () => {
      expect(emitter.getTotalSubscriberCount()).toBe(0);

      emitter.subscribe('block-1', () => {});
      emitter.subscribe('block-2', () => {});
      emitter.subscribeAll(() => {});

      expect(emitter.getTotalSubscriberCount()).toBe(3);
    });
  });

  describe('clearBlockHistory', () => {
    it('should clear history for a specific block', () => {
      emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.started', 'block-2', {});

      emitter.clearBlockHistory('block-1');

      expect(emitter.getHistory('block-1').length).toBe(0);
      expect(emitter.getHistory('block-2').length).toBe(1);
    });
  });

  describe('clearAllHistory', () => {
    it('should clear all history', () => {
      emitter.emit('block.started', 'block-1', {});
      emitter.emit('block.started', 'block-2', {});

      emitter.clearAllHistory();

      expect(emitter.getHistory('block-1').length).toBe(0);
      expect(emitter.getHistory('block-2').length).toBe(0);
    });
  });
});

describe('formatSSEEvent', () => {
  it('should format event as SSE data', () => {
    const event: BlockEvent = {
      type: 'block.started',
      blockId: 'block-123',
      seq: 42,
      data: { command: 'echo hello' },
      timestamp: '2024-01-01T00:00:00Z'
    };

    const formatted = formatSSEEvent(event);

    expect(formatted).toContain('id: 42');
    expect(formatted).toContain('event: block.started');
    expect(formatted).toContain('data: ');
    expect(formatted).toContain('"blockId":"block-123"');
    expect(formatted).toContain('"command":"echo hello"');
  });

  it('should end with double newline', () => {
    const event: BlockEvent = {
      type: 'block.started',
      blockId: 'block-1',
      seq: 1,
      data: {},
      timestamp: '2024-01-01T00:00:00Z'
    };

    const formatted = formatSSEEvent(event);
    expect(formatted.endsWith('\n\n')).toBe(true);
  });
});

// Helper functions

function createMockBlock(id: string): ExtendedBlock {
  return {
    id,
    correlationId: 'corr-123',
    command: 'echo hello',
    mode: 'ephemeral',
    submittedVia: 'api',
    stdoutPreview: '',
    stderrPreview: '',
    stdoutBytes: 0,
    stderrBytes: 0,
    truncated: false,
    status: 'running',
    startedAt: new Date().toISOString()
  };
}

function createMockChunk(blockId: string, stream: 'stdout' | 'stderr', seq: number): OutputChunk {
  return {
    id: `chunk-${blockId}-${seq}`,
    blockId,
    stream,
    seq,
    content: Buffer.from('test output').toString('base64'),
    timestamp: new Date().toISOString()
  };
}
