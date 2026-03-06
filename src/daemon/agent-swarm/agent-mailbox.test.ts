/**
 * Agent Mailbox Tests
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { AgentMailbox } from './agent-mailbox.js';
import type { SwarmConfig } from './types.js';
import { DEFAULT_SWARM_CONFIG } from './types.js';

describe('AgentMailbox', () => {
  let mailbox: AgentMailbox;
  const config: SwarmConfig = { ...DEFAULT_SWARM_CONFIG };

  beforeEach(() => {
    mailbox = new AgentMailbox(config);
  });

  afterEach(() => {
    mailbox.dispose();
  });

  describe('send', () => {
    it('should send a direct message', () => {
      const message = mailbox.send({
        from: 'agent-1',
        to: 'agent-2',
        type: 'task.assign',
        payload: { task: 'do something' }
      });

      expect(message.id).toStartWith('msg-');
      expect(message.from).toBe('agent-1');
      expect(message.to).toBe('agent-2');
      expect(message.type).toBe('task.assign');
      expect(message.payload).toEqual({ task: 'do something' });
      expect(message.acknowledged).toBe(false);
    });

    it('should emit message.sent event for direct messages', () => {
      const events: unknown[] = [];
      mailbox.on('message.sent', (msg) => events.push(msg));

      const message = mailbox.send({
        from: 'agent-1',
        to: 'agent-2',
        type: 'test'
      });

      expect(events.length).toBe(1);
      expect(events[0]).toBe(message);
    });

    it('should emit message.broadcast event for broadcast messages', () => {
      const events: unknown[] = [];
      mailbox.on('message.broadcast', (msg) => events.push(msg));

      const message = mailbox.send({
        from: 'agent-1',
        to: '*',
        type: 'announcement'
      });

      expect(events.length).toBe(1);
      expect(events[0]).toBe(message);
    });
  });

  describe('broadcast', () => {
    it('should send a broadcast message', () => {
      const message = mailbox.broadcast('agent-1', 'status.update', { status: 'done' });

      expect(message.to).toBe('*');
      expect(message.from).toBe('agent-1');
      expect(message.type).toBe('status.update');
    });
  });

  describe('getInbox', () => {
    it('should return direct messages for an agent', () => {
      mailbox.send({ from: 'agent-1', to: 'agent-2', type: 'msg1' });
      mailbox.send({ from: 'agent-1', to: 'agent-2', type: 'msg2' });
      mailbox.send({ from: 'agent-1', to: 'agent-3', type: 'msg3' });

      const inbox = mailbox.getInbox('agent-2');

      expect(inbox.length).toBe(2);
    });

    it('should include broadcast messages (except own)', () => {
      mailbox.broadcast('agent-1', 'announcement', {});
      mailbox.broadcast('agent-2', 'announcement', {});

      const inbox1 = mailbox.getInbox('agent-1');
      const inbox2 = mailbox.getInbox('agent-2');

      // agent-1 should not see own broadcast
      expect(inbox1.length).toBe(1);
      expect(inbox1[0].from).toBe('agent-2');

      // agent-2 should not see own broadcast
      expect(inbox2.length).toBe(1);
      expect(inbox2[0].from).toBe('agent-1');
    });

    it('should filter by type', () => {
      mailbox.send({ from: 'a', to: 'b', type: 'task' });
      mailbox.send({ from: 'a', to: 'b', type: 'status' });

      const inbox = mailbox.getInbox('b', { type: 'task' });

      expect(inbox.length).toBe(1);
      expect(inbox[0].type).toBe('task');
    });

    it('should filter by acknowledged status', () => {
      const msg1 = mailbox.send({ from: 'a', to: 'b', type: 't1' });
      mailbox.send({ from: 'a', to: 'b', type: 't2' });
      mailbox.acknowledge('b', msg1.id);

      const unacked = mailbox.getInbox('b', { acknowledged: false });
      const acked = mailbox.getInbox('b', { acknowledged: true });

      expect(unacked.length).toBe(1);
      expect(acked.length).toBe(1);
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge a message', () => {
      const message = mailbox.send({ from: 'a', to: 'b', type: 't' });

      const result = mailbox.acknowledge('b', message.id);
      const updated = mailbox.get(message.id);

      expect(result).toBe(true);
      expect(updated?.acknowledged).toBe(true);
      expect(updated?.acknowledgedAt).toBeDefined();
    });

    it('should return false for non-existent message', () => {
      const result = mailbox.acknowledge('agent', 'non-existent');

      expect(result).toBe(false);
    });

    it('should only allow recipient to acknowledge', () => {
      const message = mailbox.send({ from: 'a', to: 'b', type: 't' });

      const result = mailbox.acknowledge('c', message.id);

      expect(result).toBe(false);
    });

    it('should allow anyone to acknowledge broadcast', () => {
      const message = mailbox.broadcast('a', 'announcement', {});

      const result = mailbox.acknowledge('any-agent', message.id);

      expect(result).toBe(true);
    });
  });

  describe('getThread', () => {
    it('should return message thread', () => {
      const msg1 = mailbox.send({ from: 'a', to: 'b', type: 't1' });
      const msg2 = mailbox.send({ from: 'b', to: 'a', type: 't2', replyTo: msg1.id });
      mailbox.send({ from: 'a', to: 'b', type: 't3', replyTo: msg2.id });

      const thread = mailbox.getThread(msg2.id);

      expect(thread.length).toBe(3);
      // Should be sorted by timestamp
      expect(thread[0].id).toBe(msg1.id);
    });
  });

  describe('getCounts', () => {
    it('should return message counts', () => {
      mailbox.send({ from: 'a', to: 'b', type: 't1' });
      const msg2 = mailbox.send({ from: 'a', to: 'b', type: 't2' });
      mailbox.acknowledge('b', msg2.id);

      const counts = mailbox.getCounts();

      expect(counts.total).toBe(2);
      expect(counts.unacknowledged).toBe(1);
    });
  });

  describe('exportState/importState', () => {
    it('should export and import messages', () => {
      mailbox.send({ from: 'a', to: 'b', type: 't1' });
      mailbox.broadcast('a', 'announcement', {});

      const exported = mailbox.exportState();

      const newMailbox = new AgentMailbox(config);
      newMailbox.importState(exported);

      expect(newMailbox.getCounts().total).toBe(2);
      expect(newMailbox.getInbox('b').length).toBe(2); // direct + broadcast

      newMailbox.dispose();
    });
  });
});
