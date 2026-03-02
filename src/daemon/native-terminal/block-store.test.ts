/**
 * Tests for BlockStore
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { type BlockStore, createBlockStore } from './block-store.js';
import { createRedactor } from './output-redactor.js';
import type { RetentionPolicy } from './types.js';

describe('BlockStore', () => {
  let store: BlockStore;

  beforeEach(() => {
    store = createBlockStore();
  });

  describe('createBlock', () => {
    it('should create a block with unique ID', () => {
      const block = store.createBlock('session1', 'echo hello');
      expect(block.id).toMatch(/^block_\d+_[a-z0-9]+$/);
      expect(block.command).toBe('echo hello');
      expect(block.status).toBe('queued');
    });

    it('should generate correlation ID if not provided', () => {
      const block = store.createBlock('session1', 'echo hello');
      expect(block.correlationId).toMatch(/^corr_\d+_[a-z0-9]+$/);
    });

    it('should use provided correlation ID', () => {
      const block = store.createBlock('session1', 'echo hello', {
        correlationId: 'my-correlation-id'
      });
      expect(block.correlationId).toBe('my-correlation-id');
    });

    it('should set default values', () => {
      const block = store.createBlock('session1', 'echo hello');
      expect(block.mode).toBe('ephemeral');
      expect(block.submittedVia).toBe('api');
      expect(block.stdoutPreview).toBe('');
      expect(block.stderrPreview).toBe('');
      expect(block.stdoutBytes).toBe(0);
      expect(block.stderrBytes).toBe(0);
      expect(block.truncated).toBe(false);
    });

    it('should accept optional parameters', () => {
      const block = store.createBlock('session1', 'echo hello', {
        mode: 'persistent',
        submittedVia: 'interactive',
        requestedCwd: '/tmp',
        tags: ['test', 'example'],
        agentMeta: { agentId: 'agent-1' }
      });

      expect(block.mode).toBe('persistent');
      expect(block.submittedVia).toBe('interactive');
      expect(block.requestedCwd).toBe('/tmp');
      expect(block.tags).toEqual(['test', 'example']);
      expect(block.agentMeta?.agentId).toBe('agent-1');
    });
  });

  describe('updateStatus', () => {
    it('should update block status', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.updateStatus(block.id, 'running');

      const updated = store.getBlock(block.id);
      expect(updated?.status).toBe('running');
    });

    it('should handle non-existent block', () => {
      // Should not throw
      expect(() => store.updateStatus('non-existent', 'running')).not.toThrow();
    });
  });

  describe('completeBlock', () => {
    it('should complete block with success status', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.updateStatus(block.id, 'running');
      store.completeBlock(block.id, 0);

      const completed = store.getBlock(block.id);
      expect(completed?.status).toBe('success');
      expect(completed?.exitCode).toBe(0);
      expect(completed?.endedAt).toBeDefined();
      expect(completed?.durationMs).toBeDefined();
    });

    it('should complete block with error status on non-zero exit', () => {
      const block = store.createBlock('session1', 'exit 1');
      store.updateStatus(block.id, 'running');
      store.completeBlock(block.id, 1, 'nonzero');

      const completed = store.getBlock(block.id);
      expect(completed?.status).toBe('error');
      expect(completed?.exitCode).toBe(1);
      expect(completed?.errorType).toBe('nonzero');
    });

    it('should set timeout status', () => {
      const block = store.createBlock('session1', 'sleep 100');
      store.updateStatus(block.id, 'running');
      store.completeBlock(block.id, -1, 'timeout');

      const completed = store.getBlock(block.id);
      expect(completed?.status).toBe('timeout');
      expect(completed?.errorType).toBe('timeout');
    });

    it('should set canceled status', () => {
      const block = store.createBlock('session1', 'sleep 100');
      store.updateStatus(block.id, 'running');
      store.completeBlock(block.id, -1, 'canceled');

      const completed = store.getBlock(block.id);
      expect(completed?.status).toBe('canceled');
      expect(completed?.errorType).toBe('canceled');
    });
  });

  describe('appendOutput', () => {
    it('should append stdout and create chunks', () => {
      const block = store.createBlock('session1', 'echo hello');
      const chunks = store.appendOutput(block.id, 'stdout', 'Hello, World!');

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].stream).toBe('stdout');
      expect(chunks[0].blockId).toBe(block.id);
    });

    it('should update preview and byte count', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Hello');
      store.appendOutput(block.id, 'stderr', 'Error');

      const updated = store.getBlock(block.id);
      expect(updated?.stdoutPreview).toBe('Hello');
      expect(updated?.stderrPreview).toBe('Error');
      expect(updated?.stdoutBytes).toBe(5);
      expect(updated?.stderrBytes).toBe(5);
    });

    it('should truncate preview at 500 characters', () => {
      const block = store.createBlock('session1', 'echo hello');
      const longOutput = 'x'.repeat(600);
      store.appendOutput(block.id, 'stdout', longOutput);

      const updated = store.getBlock(block.id);
      expect(updated?.stdoutPreview.length).toBe(500);
    });

    it('should redact sensitive content', () => {
      const redactor = createRedactor({ enabled: true });
      const store = createBlockStore(undefined, redactor);

      const block = store.createBlock('session1', 'cat secrets');
      store.appendOutput(block.id, 'stdout', 'AKIAIOSFODNN7EXAMPLE');

      const updated = store.getBlock(block.id);
      expect(updated?.stdoutPreview).toBe('[REDACTED]');
    });

    it('should mark as truncated when exceeding max size', () => {
      const block = store.createBlock('session1', 'echo hello');

      // Append more than 1MB
      const largeOutput = 'x'.repeat(1024 * 512); // 512KB
      store.appendOutput(block.id, 'stdout', largeOutput);
      store.appendOutput(block.id, 'stdout', largeOutput);
      store.appendOutput(block.id, 'stdout', largeOutput);

      const updated = store.getBlock(block.id);
      expect(updated?.truncated).toBe(true);
    });
  });

  describe('getBlockChunks', () => {
    it('should return chunks for a block', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Line 1\n');
      store.appendOutput(block.id, 'stderr', 'Error 1\n');

      const result = store.getBlockChunks(block.id);
      expect(result.chunks.length).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it('should filter by fromSeq', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Line 1\n');
      const chunks = store.appendOutput(block.id, 'stdout', 'Line 2\n');
      const lastSeq = chunks[0].seq;

      const result = store.getBlockChunks(block.id, { fromSeq: lastSeq - 1 });
      expect(result.chunks.length).toBe(1);
    });

    it('should filter by stream type', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Output\n');
      store.appendOutput(block.id, 'stderr', 'Error\n');

      const stdoutResult = store.getBlockChunks(block.id, { stream: 'stdout' });
      expect(stdoutResult.chunks.every((c) => c.stream === 'stdout')).toBe(true);

      const stderrResult = store.getBlockChunks(block.id, { stream: 'stderr' });
      expect(stderrResult.chunks.every((c) => c.stream === 'stderr')).toBe(true);
    });

    it('should respect limit parameter', () => {
      const block = store.createBlock('session1', 'echo hello');
      for (let i = 0; i < 5; i++) {
        store.appendOutput(block.id, 'stdout', `Line ${i}\n`);
      }

      const result = store.getBlockChunks(block.id, { limit: 2 });
      expect(result.chunks.length).toBe(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('pinBlock / unpinBlock', () => {
    it('should pin a block', () => {
      const block = store.createBlock('session1', 'echo hello');
      const success = store.pinBlock(block.id);

      expect(success).toBe(true);
      expect(store.getBlock(block.id)?.pinned).toBe(true);
    });

    it('should unpin a block', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.pinBlock(block.id);
      const success = store.unpinBlock(block.id);

      expect(success).toBe(true);
      expect(store.getBlock(block.id)?.pinned).toBe(false);
    });

    it('should return false for non-existent block', () => {
      expect(store.pinBlock('non-existent')).toBe(false);
      expect(store.unpinBlock('non-existent')).toBe(false);
    });
  });

  describe('deleteBlock', () => {
    it('should delete a block and its chunks', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Output');

      const success = store.deleteBlock(block.id);
      expect(success).toBe(true);
      expect(store.getBlock(block.id)).toBeUndefined();
    });

    it('should return false for non-existent block', () => {
      expect(store.deleteBlock('non-existent')).toBe(false);
    });
  });

  describe('compressBlock', () => {
    it('should remove chunks but keep metadata', () => {
      const block = store.createBlock('session1', 'echo hello');
      store.appendOutput(block.id, 'stdout', 'Output');

      const success = store.compressBlock(block.id);
      expect(success).toBe(true);

      const compressed = store.getBlock(block.id);
      expect(compressed).toBeDefined();
      expect(compressed?.stdoutPreview).toBe('Output');

      const chunks = store.getBlockChunks(block.id);
      expect(chunks.chunks.length).toBe(0);
    });
  });

  describe('retention policy', () => {
    it('should limit blocks per session', () => {
      const policy: RetentionPolicy = {
        maxRecentBlocks: 5,
        maxFailedBlocks: 200,
        failedRetentionDays: 30,
        fullOutputRecentCount: 20,
        olderBlocksPreviewOnly: true,
        maxPinnedBlocks: 50
      };
      const store = createBlockStore(policy);

      // Create more blocks than the limit
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const block = store.createBlock('session1', `echo ${i}`);
        ids.push(block.id);
      }

      // Older blocks should be deleted
      const blocks = store.getSessionBlocks('session1');
      expect(blocks.length).toBeLessThanOrEqual(5);

      // Most recent blocks should exist
      expect(store.getBlock(ids[9])).toBeDefined();
    });

    it('should preserve failed blocks longer', () => {
      const policy: RetentionPolicy = {
        maxRecentBlocks: 2,
        maxFailedBlocks: 10,
        failedRetentionDays: 30,
        fullOutputRecentCount: 20,
        olderBlocksPreviewOnly: true,
        maxPinnedBlocks: 50
      };
      const store = createBlockStore(policy);

      // Create some failed blocks
      for (let i = 0; i < 5; i++) {
        const block = store.createBlock('session1', `fail ${i}`);
        store.completeBlock(block.id, 1, 'nonzero');
      }

      // Create some success blocks
      for (let i = 0; i < 5; i++) {
        store.createBlock('session1', `success ${i}`);
      }

      const blocks = store.getSessionBlocks('session1');
      const failedBlocks = blocks.filter((b) => b.status === 'error');

      // Failed blocks should be preserved
      expect(failedBlocks.length).toBeGreaterThanOrEqual(5);
    });

    it('should compress old blocks', () => {
      const policy: RetentionPolicy = {
        maxRecentBlocks: 100,
        maxFailedBlocks: 200,
        failedRetentionDays: 30,
        fullOutputRecentCount: 2,
        olderBlocksPreviewOnly: true,
        maxPinnedBlocks: 50
      };
      const store = createBlockStore(policy);

      // Create blocks with output
      for (let i = 0; i < 5; i++) {
        const block = store.createBlock('session1', `echo ${i}`);
        store.appendOutput(block.id, 'stdout', `Output ${i}`);
      }

      const stats = store.getStats();
      // Older blocks should be compressed (no chunks)
      expect(stats.compressedBlocks).toBeGreaterThan(0);
    });
  });

  describe('getSessionBlocks', () => {
    it('should return only blocks for specified session', () => {
      store.createBlock('session1', 'echo 1');
      store.createBlock('session2', 'echo 2');
      store.createBlock('session1', 'echo 3');

      const session1Blocks = store.getSessionBlocks('session1');
      expect(session1Blocks.length).toBe(2);

      const session2Blocks = store.getSessionBlocks('session2');
      expect(session2Blocks.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return store statistics', () => {
      const block1 = store.createBlock('session1', 'echo 1');
      const block2 = store.createBlock('session1', 'echo 2');
      store.appendOutput(block1.id, 'stdout', 'Output');
      store.completeBlock(block2.id, 1, 'nonzero');
      store.pinBlock(block1.id);

      const stats = store.getStats();
      expect(stats.totalBlocks).toBe(2);
      expect(stats.pinnedBlocks).toBe(1);
      expect(stats.failedBlocks).toBe(1);
      expect(stats.sessionCount).toBe(1);
    });
  });

  describe('clearSession', () => {
    it('should clear all blocks for a session', () => {
      store.createBlock('session1', 'echo 1');
      store.createBlock('session2', 'echo 2');
      store.createBlock('session1', 'echo 3');

      store.clearSession('session1');

      expect(store.getSessionBlocks('session1').length).toBe(0);
      expect(store.getSessionBlocks('session2').length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all blocks', () => {
      store.createBlock('session1', 'echo 1');
      store.createBlock('session2', 'echo 2');

      store.clear();

      expect(store.getStats().totalBlocks).toBe(0);
    });
  });
});
