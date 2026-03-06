/**
 * Shared Context Store Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { SharedContextStore } from './shared-context.js';
import type { SwarmConfig } from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';

describe('SharedContextStore', () => {
  let store: SharedContextStore;
  const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, enabled: false };

  beforeEach(() => {
    store = new SharedContextStore(config);
  });

  afterEach(() => {
    store.dispose();
  });

  describe('Context', () => {
    describe('set/get', () => {
      it('should set and get context entry', () => {
        const entry = store.set({
          key: 'project.name',
          value: 'my-project',
          agentId: 'agent-1'
        });

        expect(entry.key).toBe('project.name');
        expect(entry.value).toBe('my-project');
        expect(entry.setBy).toBe('agent-1');

        const retrieved = store.get('project.name');
        expect(retrieved).toEqual(entry);
      });

      it('should update existing entry', () => {
        store.set({ key: 'k', value: 'v1', agentId: 'a1' });
        const updated = store.set({ key: 'k', value: 'v2', agentId: 'a2' });

        expect(updated.value).toBe('v2');
        expect(updated.setBy).toBe('a2');
        // createdAt should be preserved
        expect(store.get('k')?.createdAt).toBe(updated.createdAt);
      });

      it('should handle TTL expiration', async () => {
        store.set({
          key: 'temp',
          value: 'data',
          agentId: 'a1',
          ttlMs: 50
        });

        expect(store.get('temp')).not.toBeNull();

        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(store.get('temp')).toBeNull();
      });
    });

    describe('delete', () => {
      it('should delete context entry', () => {
        store.set({ key: 'k', value: 'v', agentId: 'a' });

        const result = store.delete('k');

        expect(result).toBe(true);
        expect(store.get('k')).toBeNull();
      });

      it('should return false for non-existent key', () => {
        expect(store.delete('non-existent')).toBe(false);
      });
    });

    describe('listContext', () => {
      it('should list all context entries', () => {
        store.set({ key: 'k1', value: 'v1', agentId: 'a' });
        store.set({ key: 'k2', value: 'v2', agentId: 'a' });

        const entries = store.listContext();

        expect(entries.length).toBe(2);
      });
    });
  });

  describe('Tasks', () => {
    describe('createTask', () => {
      it('should create a new task', () => {
        const task = store.createTask({
          subject: 'Implement feature',
          description: 'Do something cool',
          createdBy: 'agent-1'
        });

        expect(task.id).toStartWith('task-');
        expect(task.subject).toBe('Implement feature');
        expect(task.status).toBe('pending');
        expect(task.createdBy).toBe('agent-1');
      });

      it('should emit task.created event', () => {
        const events: unknown[] = [];
        store.on('task.created', (task) => events.push(task));

        store.createTask({ subject: 'Test' });

        expect(events.length).toBe(1);
      });
    });

    describe('claimTask', () => {
      it('should claim an unassigned task', () => {
        const task = store.createTask({ subject: 'Test' });

        const result = store.claimTask(task.id, 'agent-1');
        const updated = store.getTask(task.id);

        expect(result).toBe(true);
        expect(updated?.assignedTo).toBe('agent-1');
        expect(updated?.status).toBe('in_progress');
      });

      it('should not claim already assigned task', () => {
        const task = store.createTask({ subject: 'Test' });
        store.claimTask(task.id, 'agent-1');

        const result = store.claimTask(task.id, 'agent-2');

        expect(result).toBe(false);
      });

      it('should not claim blocked task', () => {
        const blocker = store.createTask({ subject: 'Blocker' });
        const task = store.createTask({
          subject: 'Blocked',
          blockedBy: [blocker.id]
        });

        const result = store.claimTask(task.id, 'agent-1');

        expect(result).toBe(false);
      });

      it('should allow claiming task when blockers are completed', () => {
        const blocker = store.createTask({ subject: 'Blocker' });
        const task = store.createTask({
          subject: 'Blocked',
          blockedBy: [blocker.id]
        });

        store.updateTask(blocker.id, { status: 'completed' });
        const result = store.claimTask(task.id, 'agent-1');

        expect(result).toBe(true);
      });
    });

    describe('updateTask', () => {
      it('should update task fields', () => {
        const task = store.createTask({ subject: 'Test' });

        const updated = store.updateTask(task.id, {
          status: 'in_progress',
          priority: 10
        });

        expect(updated?.status).toBe('in_progress');
        expect(updated?.priority).toBe(10);
      });

      it('should emit task.completed when completing', () => {
        const task = store.createTask({ subject: 'Test' });
        const events: unknown[] = [];
        store.on('task.completed', (t) => events.push(t));

        store.updateTask(task.id, { status: 'completed' });

        expect(events.length).toBe(1);
      });

      it('should handle addBlockedBy/removeBlockedBy', () => {
        const task = store.createTask({ subject: 'Test' });
        const blocker = store.createTask({ subject: 'Blocker' });

        store.updateTask(task.id, { addBlockedBy: [blocker.id] });
        expect(store.getTask(task.id)?.blockedBy).toContain(blocker.id);

        store.updateTask(task.id, { removeBlockedBy: [blocker.id] });
        expect(store.getTask(task.id)?.blockedBy).not.toContain(blocker.id);
      });
    });

    describe('listTasks', () => {
      it('should list all tasks', () => {
        store.createTask({ subject: 'T1' });
        store.createTask({ subject: 'T2' });

        const tasks = store.listTasks();

        expect(tasks.length).toBe(2);
      });

      it('should filter by status', () => {
        const t1 = store.createTask({ subject: 'T1' });
        store.createTask({ subject: 'T2' });
        store.claimTask(t1.id, 'agent');

        const inProgress = store.listTasks({ status: 'in_progress' });
        const pending = store.listTasks({ status: 'pending' });

        expect(inProgress.length).toBe(1);
        expect(pending.length).toBe(1);
      });

      it('should sort by priority (desc) then createdAt (asc)', () => {
        store.createTask({ subject: 'Low', priority: 1 });
        store.createTask({ subject: 'High', priority: 10 });
        store.createTask({ subject: 'Medium', priority: 5 });

        const tasks = store.listTasks();

        expect(tasks[0].subject).toBe('High');
        expect(tasks[1].subject).toBe('Medium');
        expect(tasks[2].subject).toBe('Low');
      });
    });

    describe('getAvailableTasks', () => {
      it('should return pending, unblocked, unassigned tasks', () => {
        store.createTask({ subject: 'Available' });
        const blocked = store.createTask({ subject: 'Blocked' });
        const assigned = store.createTask({ subject: 'Assigned' });

        const blocker = store.createTask({ subject: 'Blocker' });
        store.updateTask(blocked.id, { addBlockedBy: [blocker.id] });
        store.claimTask(assigned.id, 'agent');

        const available = store.getAvailableTasks();

        expect(available.length).toBe(2); // "Available" and "Blocker"
      });
    });
  });

  describe('Locks', () => {
    describe('acquireLock', () => {
      it('should acquire a lock', async () => {
        const result = await store.acquireLock('file.ts', 'agent-1');
        const lock = store.getLock('file.ts');

        expect(result).toBe(true);
        expect(lock?.heldBy).toBe('agent-1');
        expect(lock?.resource).toBe('file.ts');
      });

      it('should return true if same agent already holds lock', async () => {
        await store.acquireLock('file.ts', 'agent-1');

        const result = await store.acquireLock('file.ts', 'agent-1');

        expect(result).toBe(true);
      });

      it('should return false if different agent holds lock', async () => {
        await store.acquireLock('file.ts', 'agent-1');

        const result = await store.acquireLock('file.ts', 'agent-2');

        expect(result).toBe(false);
      });

      it('should allow acquiring expired lock', async () => {
        await store.acquireLock('file.ts', 'agent-1', 50);
        await new Promise((resolve) => setTimeout(resolve, 60));

        const result = await store.acquireLock('file.ts', 'agent-2');

        expect(result).toBe(true);
        expect(store.getLock('file.ts')?.heldBy).toBe('agent-2');
      });
    });

    describe('releaseLock', () => {
      it('should release a lock', async () => {
        await store.acquireLock('file.ts', 'agent-1');

        const result = store.releaseLock('file.ts', 'agent-1');

        expect(result).toBe(true);
        expect(store.getLock('file.ts')).toBeNull();
      });

      it('should return false if not holder', async () => {
        await store.acquireLock('file.ts', 'agent-1');

        const result = store.releaseLock('file.ts', 'agent-2');

        expect(result).toBe(false);
      });
    });

    describe('isLocked', () => {
      it('should return true for locked resource', async () => {
        await store.acquireLock('file.ts', 'agent-1');

        expect(store.isLocked('file.ts')).toBe(true);
      });

      it('should return false for unlocked resource', () => {
        expect(store.isLocked('file.ts')).toBe(false);
      });

      it('should return false for expired lock', async () => {
        await store.acquireLock('file.ts', 'agent-1', 50);
        await new Promise((resolve) => setTimeout(resolve, 60));

        expect(store.isLocked('file.ts')).toBe(false);
      });
    });

    describe('releaseAllLocks', () => {
      it('should release all locks held by agent', async () => {
        await store.acquireLock('f1.ts', 'agent-1');
        await store.acquireLock('f2.ts', 'agent-1');
        await store.acquireLock('f3.ts', 'agent-2');

        const count = store.releaseAllLocks('agent-1');

        expect(count).toBe(2);
        expect(store.listLocks().length).toBe(1);
      });
    });
  });

  describe('exportState/importState', () => {
    it('should export and import all state', async () => {
      store.set({ key: 'k', value: 'v', agentId: 'a' });
      store.createTask({ subject: 'Task' });
      await store.acquireLock('file.ts', 'agent');

      const exported = store.exportState();

      const newStore = new SharedContextStore(config);
      newStore.importState(exported);

      expect(newStore.get('k')).not.toBeNull();
      expect(newStore.listTasks().length).toBe(1);
      expect(newStore.listLocks().length).toBe(1);

      newStore.dispose();
    });
  });
});
