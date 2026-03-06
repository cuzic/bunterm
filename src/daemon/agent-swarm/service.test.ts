/**
 * Agent Swarm Service Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AgentSwarmService } from './service.js';
import type { SwarmConfig, SwarmEvent } from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';

describe('AgentSwarmService', () => {
  let service: AgentSwarmService;
  const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, enabled: false };

  beforeEach(() => {
    service = new AgentSwarmService(config);
  });

  afterEach(() => {
    service.dispose();
  });

  describe('Agent Management', () => {
    it('should register and list agents', () => {
      service.registerAgent({ sessionName: 's1', name: 'agent1' });
      service.registerAgent({ sessionName: 's2', name: 'agent2' });

      const agents = service.listAgents();

      expect(agents.length).toBe(2);
    });

    it('should unregister and clean up agent data', () => {
      const agent = service.registerAgent({ sessionName: 's1' });

      // Send messages and acquire locks
      service.sendMessage({
        from: 'other',
        to: agent.id,
        type: 'test'
      });

      service.unregisterAgent(agent.id);

      expect(service.getAgent(agent.id)).toBeNull();
    });

    it('should find agents by capability', () => {
      service.registerAgent({ sessionName: 's1', capabilities: ['code', 'test'] });
      service.registerAgent({ sessionName: 's2', capabilities: ['code'] });

      const testers = service.findAgentsByCapability('test');

      expect(testers.length).toBe(1);
    });
  });

  describe('Messaging', () => {
    it('should send and receive messages', () => {
      const a1 = service.registerAgent({ sessionName: 's1' });
      const a2 = service.registerAgent({ sessionName: 's2' });

      service.sendMessage({
        from: a1.id,
        to: a2.id,
        type: 'greeting',
        payload: 'Hello!'
      });

      const inbox = service.getInbox(a2.id);

      expect(inbox.length).toBe(1);
      expect(inbox[0].payload).toBe('Hello!');
    });

    it('should broadcast messages', () => {
      const a1 = service.registerAgent({ sessionName: 's1' });
      const a2 = service.registerAgent({ sessionName: 's2' });

      service.broadcastMessage(a1.id, 'announcement', { message: 'Hello all!' });

      const inbox2 = service.getInbox(a2.id);

      expect(inbox2.length).toBe(1);
    });

    it('should acknowledge messages', () => {
      const a1 = service.registerAgent({ sessionName: 's1' });
      const a2 = service.registerAgent({ sessionName: 's2' });

      const msg = service.sendMessage({
        from: a1.id,
        to: a2.id,
        type: 'test'
      });

      service.acknowledgeMessage(a2.id, msg.id);

      const updated = service.getMessage(msg.id);
      expect(updated?.acknowledged).toBe(true);
    });
  });

  describe('Tasks', () => {
    it('should create and claim tasks', () => {
      const agent = service.registerAgent({ sessionName: 's1' });

      const task = service.createTask({
        subject: 'Do something',
        createdBy: agent.id
      });

      const claimed = service.claimTask(task.id, agent.id);
      const updated = service.getTask(task.id);

      expect(claimed).toBe(true);
      expect(updated?.assignedTo).toBe(agent.id);
      expect(updated?.status).toBe('in_progress');
    });

    it('should get available tasks', () => {
      service.createTask({ subject: 'Task 1' });
      service.createTask({ subject: 'Task 2' });

      const available = service.getAvailableTasks();

      expect(available.length).toBe(2);
    });
  });

  describe('Context', () => {
    it('should set and get context', () => {
      const agent = service.registerAgent({ sessionName: 's1' });

      service.setContext({
        key: 'project.name',
        value: 'my-project',
        agentId: agent.id
      });

      const entry = service.getContext('project.name');

      expect(entry?.value).toBe('my-project');
    });

    it('should delete context', () => {
      const agent = service.registerAgent({ sessionName: 's1' });

      service.setContext({
        key: 'temp',
        value: 'data',
        agentId: agent.id
      });

      service.deleteContext('temp');

      expect(service.getContext('temp')).toBeNull();
    });
  });

  describe('Locks', () => {
    it('should acquire and release locks', async () => {
      const agent = service.registerAgent({ sessionName: 's1' });

      const acquired = await service.acquireLock('file.ts', agent.id);
      expect(acquired).toBe(true);
      expect(service.isLocked('file.ts')).toBe(true);

      const released = service.releaseLock('file.ts', agent.id);
      expect(released).toBe(true);
      expect(service.isLocked('file.ts')).toBe(false);
    });
  });

  describe('Event Stream', () => {
    it('should emit unified events', () => {
      const events: SwarmEvent[] = [];
      service.on('event', (event) => events.push(event));

      const agent = service.registerAgent({ sessionName: 's1' });
      service.sendMessage({ from: agent.id, to: '*', type: 'test' });
      service.createTask({ subject: 'Task' });

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.some((e) => e.type === 'agent.registered')).toBe(true);
      expect(events.some((e) => e.type === 'message.broadcast')).toBe(true);
      expect(events.some((e) => e.type === 'task.created')).toBe(true);
    });

    it('should include sequence numbers', () => {
      const events: SwarmEvent[] = [];
      service.on('event', (event) => events.push(event));

      service.registerAgent({ sessionName: 's1' });
      service.registerAgent({ sessionName: 's2' });

      expect(events[0].seq).toBe(1);
      expect(events[1].seq).toBe(2);
    });
  });

  describe('Status', () => {
    it('should return swarm status', async () => {
      const agent = service.registerAgent({ sessionName: 's1' });
      service.createTask({ subject: 'Task' });
      await service.acquireLock('file.ts', agent.id);

      const status = service.getStatus();

      expect(status.agents.length).toBe(1);
      expect(status.tasks.pending).toBe(1);
      expect(status.locks.length).toBe(1);
    });
  });

  describe('State Persistence', () => {
    it('should export and import state', () => {
      const agent = service.registerAgent({ sessionName: 's1', name: 'test' });
      service.sendMessage({ from: agent.id, to: '*', type: 'msg' });
      service.createTask({ subject: 'Task' });
      service.setContext({ key: 'k', value: 'v', agentId: agent.id });

      const state = service.exportState();

      const newService = new AgentSwarmService(config);
      newService.importState(state);

      expect(newService.listAgents().length).toBe(1);
      expect(newService.listTasks().length).toBe(1);
      expect(newService.listContext().length).toBe(1);

      newService.dispose();
    });
  });
});
