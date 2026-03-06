/**
 * Agent Registry Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AgentRegistry } from './agent-registry.js';
import type { SwarmConfig } from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, enabled: false };

  beforeEach(() => {
    registry = new AgentRegistry(config);
  });

  afterEach(() => {
    registry.dispose();
  });

  describe('register', () => {
    it('should register a new agent', () => {
      const agent = registry.register({
        sessionName: 'test-session',
        name: 'test-agent',
        role: 'worker',
        capabilities: ['code', 'test']
      });

      expect(agent.id).toStartWith('agent-');
      expect(agent.sessionName).toBe('test-session');
      expect(agent.name).toBe('test-agent');
      expect(agent.role).toBe('worker');
      expect(agent.capabilities).toEqual(['code', 'test']);
      expect(agent.status).toBe('active');
    });

    it('should emit agent.registered event', () => {
      const events: unknown[] = [];
      registry.on('agent.registered', (agent) => events.push(agent));

      const agent = registry.register({
        sessionName: 'test-session'
      });

      expect(events.length).toBe(1);
      expect(events[0]).toBe(agent);
    });

    it('should throw error when max agents reached', () => {
      const limitedConfig: SwarmConfig = { ...config, max_agents: 2 };
      const limitedRegistry = new AgentRegistry(limitedConfig);

      limitedRegistry.register({ sessionName: 's1' });
      limitedRegistry.register({ sessionName: 's2' });

      expect(() => limitedRegistry.register({ sessionName: 's3' })).toThrow(
        'Maximum number of agents (2) reached'
      );

      limitedRegistry.dispose();
    });
  });

  describe('unregister', () => {
    it('should unregister an existing agent', () => {
      const agent = registry.register({ sessionName: 'test' });

      const result = registry.unregister(agent.id);

      expect(result).toBe(true);
      expect(registry.get(agent.id)).toBeNull();
    });

    it('should return false for non-existent agent', () => {
      const result = registry.unregister('non-existent');

      expect(result).toBe(false);
    });

    it('should emit agent.unregistered event', () => {
      const events: string[] = [];
      registry.on('agent.unregistered', (agentId) => events.push(agentId));

      const agent = registry.register({ sessionName: 'test' });
      registry.unregister(agent.id);

      expect(events).toEqual([agent.id]);
    });
  });

  describe('heartbeat', () => {
    it('should update lastHeartbeat', () => {
      const agent = registry.register({ sessionName: 'test' });
      const initialHeartbeat = agent.lastHeartbeat;

      // Wait a tiny bit to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 5) {
        // busy wait
      }

      registry.heartbeat(agent.id);
      const updated = registry.get(agent.id);

      expect(updated?.lastHeartbeat).not.toBe(initialHeartbeat);
    });

    it('should update status if provided', () => {
      const agent = registry.register({ sessionName: 'test' });

      registry.heartbeat(agent.id, 'busy');
      const updated = registry.get(agent.id);

      expect(updated?.status).toBe('busy');
    });

    it('should return false for non-existent agent', () => {
      const result = registry.heartbeat('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('listAgents', () => {
    it('should list all agents', () => {
      registry.register({ sessionName: 's1', name: 'agent1' });
      registry.register({ sessionName: 's2', name: 'agent2' });

      const agents = registry.listAgents();

      expect(agents.length).toBe(2);
    });

    it('should filter by status', () => {
      const a1 = registry.register({ sessionName: 's1' });
      registry.register({ sessionName: 's2' });
      registry.heartbeat(a1.id, 'busy');

      const busy = registry.listAgents({ status: 'busy' });
      const active = registry.listAgents({ status: 'active' });

      expect(busy.length).toBe(1);
      expect(active.length).toBe(1);
    });

    it('should filter by capability', () => {
      registry.register({ sessionName: 's1', capabilities: ['code', 'test'] });
      registry.register({ sessionName: 's2', capabilities: ['code'] });
      registry.register({ sessionName: 's3', capabilities: ['plan'] });

      const coders = registry.listAgents({ capability: 'code' });
      const testers = registry.listAgents({ capability: 'test' });

      expect(coders.length).toBe(2);
      expect(testers.length).toBe(1);
    });

    it('should filter by sessionName', () => {
      registry.register({ sessionName: 'session-a' });
      registry.register({ sessionName: 'session-b' });

      const agents = registry.listAgents({ sessionName: 'session-a' });

      expect(agents.length).toBe(1);
      expect(agents[0].sessionName).toBe('session-a');
    });
  });

  describe('findByCapability', () => {
    it('should find agents by capability', () => {
      registry.register({ sessionName: 's1', capabilities: ['code', 'test'] });
      registry.register({ sessionName: 's2', capabilities: ['code'] });

      const agents = registry.findByCapability('test');

      expect(agents.length).toBe(1);
    });
  });

  describe('exportState/importState', () => {
    it('should export and import state', () => {
      registry.register({ sessionName: 's1', name: 'agent1' });
      registry.register({ sessionName: 's2', name: 'agent2' });

      const exported = registry.exportState();

      const newRegistry = new AgentRegistry(config);
      newRegistry.importState(exported);

      expect(newRegistry.listAgents().length).toBe(2);
      newRegistry.dispose();
    });
  });
});
