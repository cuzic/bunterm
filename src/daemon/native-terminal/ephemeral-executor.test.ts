/**
 * Tests for EphemeralExecutor
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createBlockStore } from './block-store.js';
import { type EphemeralExecutor, createEphemeralExecutor } from './ephemeral-executor.js';
import type { ExecutorEvent } from './ephemeral-executor.js';

describe('EphemeralExecutor', () => {
  let executor: EphemeralExecutor;

  beforeEach(() => {
    const blockStore = createBlockStore();
    executor = createEphemeralExecutor('test-session', process.cwd(), blockStore);
  });

  afterEach(async () => {
    await executor.cleanup();
  });

  describe('execute', () => {
    it('should execute a simple command', async () => {
      const response = await executor.execute({
        command: 'echo hello'
      });

      expect(response.blockId).toMatch(/^block_/);
      expect(response.correlationId).toMatch(/^corr_/);
      expect(response.status).toBe('success');
    });

    it('should capture stdout', async () => {
      const response = await executor.execute({
        command: 'echo "test output"'
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.stdoutPreview).toContain('test output');
      expect(block?.stdoutBytes).toBeGreaterThan(0);
    });

    it('should capture stderr', async () => {
      const response = await executor.execute({
        command: 'echo "error message" >&2'
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.stderrPreview).toContain('error message');
      expect(block?.stderrBytes).toBeGreaterThan(0);
    });

    it('should set error status on non-zero exit', async () => {
      const response = await executor.execute({
        command: 'exit 1'
      });

      expect(response.status).toBe('error');

      const block = executor.getBlock(response.blockId);
      expect(block?.exitCode).toBe(1);
      expect(block?.errorType).toBe('nonzero');
    });

    it('should use specified working directory', async () => {
      const response = await executor.execute({
        command: 'pwd',
        cwd: '/tmp'
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.stdoutPreview).toContain('/tmp');
      expect(block?.requestedCwd).toBe('/tmp');
    });

    it('should use specified environment variables', async () => {
      const response = await executor.execute({
        command: 'echo $MY_VAR',
        env: { MY_VAR: 'test-value' }
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.stdoutPreview).toContain('test-value');
      expect(block?.requestedEnv).toEqual({ MY_VAR: 'test-value' });
    });

    it('should capture git info when in git repo', async () => {
      // This test assumes we're running in a git repo
      const response = await executor.execute({
        command: 'echo test',
        captureGitInfo: true
      });

      const block = executor.getBlock(response.blockId);
      // May or may not have git info depending on test environment
      if (block?.gitInfo) {
        expect(block.gitInfo.head).toMatch(/^[a-f0-9]{40}$/);
        expect(typeof block.gitInfo.dirty).toBe('boolean');
      }
    });

    it('should skip git info when disabled', async () => {
      const response = await executor.execute({
        command: 'echo test',
        captureGitInfo: false
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.gitInfo).toBeUndefined();
    });

    it('should set execution mode to ephemeral', async () => {
      const response = await executor.execute({
        command: 'echo test'
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.mode).toBe('ephemeral');
      expect(block?.submittedVia).toBe('api');
    });

    it('should store tags and agent metadata', async () => {
      const response = await executor.execute({
        command: 'echo test',
        tags: ['test', 'example'],
        agentMeta: { agentId: 'agent-1', contextId: 'ctx-1' }
      });

      const block = executor.getBlock(response.blockId);
      expect(block?.tags).toEqual(['test', 'example']);
      expect(block?.agentMeta?.agentId).toBe('agent-1');
      expect(block?.agentMeta?.contextId).toBe('ctx-1');
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running commands', async () => {
      const response = await executor.execute({
        command: 'sleep 10',
        timeoutMs: 100
      });

      expect(response.status).toBe('timeout');

      const block = executor.getBlock(response.blockId);
      expect(block?.errorType).toBe('timeout');
    });
  });

  describe('cancelCommand', () => {
    it('should cancel a running command', async () => {
      // Start a long-running command
      const executePromise = executor.execute({
        command: 'sleep 100',
        timeoutMs: 10000
      });

      // Wait a bit for the command to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get the block ID from the executor's running commands
      const blocks = executor.getBlocks();
      const runningBlock = blocks.find((b) => b.status === 'running');

      if (runningBlock) {
        const success = executor.cancelCommand(runningBlock.id, 'SIGTERM');
        expect(success).toBe(true);
      }

      const response = await executePromise;
      expect(['canceled', 'timeout']).toContain(response.status);
    });

    it('should return false for non-running command', () => {
      const success = executor.cancelCommand('non-existent', 'SIGTERM');
      expect(success).toBe(false);
    });
  });

  describe('event listeners', () => {
    it('should emit events for command execution', async () => {
      const events: ExecutorEvent[] = [];

      executor.addEventListener((event) => {
        events.push(event);
      });

      await executor.execute({
        command: 'echo "hello"'
      });

      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('started');
      expect(eventTypes).toContain('completed');
    });

    it('should emit stdout events', async () => {
      const events: ExecutorEvent[] = [];

      executor.addEventListener((event) => {
        events.push(event);
      });

      await executor.execute({
        command: 'echo "hello world"'
      });

      const stdoutEvents = events.filter((e) => e.type === 'stdout');
      expect(stdoutEvents.length).toBeGreaterThan(0);
    });

    it('should allow removing event listeners', async () => {
      const events: ExecutorEvent[] = [];
      const listener = (event: ExecutorEvent) => events.push(event);

      executor.addEventListener(listener);
      executor.removeEventListener(listener);

      await executor.execute({
        command: 'echo "hello"'
      });

      expect(events.length).toBe(0);
    });
  });

  describe('getBlocks', () => {
    it('should return all blocks for the session', async () => {
      await executor.execute({ command: 'echo 1' });
      await executor.execute({ command: 'echo 2' });

      const blocks = executor.getBlocks();
      expect(blocks.length).toBe(2);
    });
  });

  describe('getBlockChunks', () => {
    it('should return chunks for a block', async () => {
      const response = await executor.execute({
        command: 'echo "test output"'
      });

      const result = executor.getBlockChunks(response.blockId);
      expect(result.chunks.length).toBeGreaterThan(0);
    });
  });

  describe('isRunning', () => {
    it('should return false for completed commands', async () => {
      const response = await executor.execute({
        command: 'echo test'
      });

      expect(executor.isRunning(response.blockId)).toBe(false);
    });
  });

  describe('getBlockStore', () => {
    it('should return the underlying block store', () => {
      const store = executor.getBlockStore();
      expect(store).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should not throw when called multiple times', async () => {
      await executor.cleanup();
      await expect(executor.cleanup()).resolves.toBeUndefined();
    });
  });
});
