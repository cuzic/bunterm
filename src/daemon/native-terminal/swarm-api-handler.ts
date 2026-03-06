/**
 * Swarm API Handler
 *
 * Handles HTTP API routes for the agent swarm system.
 */

import type { Config } from '@/config/types.js';
import { AgentSwarmService } from '@/daemon/agent-swarm/service.js';
import type {
  AgentFilter,
  CreateTaskRequest,
  MessageFilter,
  RegisterAgentRequest,
  SendMessageRequest,
  SetContextRequest,
  TaskFilter,
  UpdateTaskRequest
} from '@/daemon/agent-swarm/types.js';
import { createLogger } from '@/utils/logger.js';

const log = createLogger('swarm-api');

// Singleton swarm service instance
let swarmService: AgentSwarmService | null = null;

/**
 * Get or create the swarm service
 */
function getSwarmService(config: Config): AgentSwarmService {
  if (!swarmService) {
    swarmService = new AgentSwarmService(config.swarm);
    log.info('Agent swarm service initialized');
  }
  return swarmService;
}

/**
 * Handle swarm API requests
 */
export async function handleSwarmApi(
  req: Request,
  apiPath: string,
  method: string,
  headers: Record<string, string>,
  config: Config
): Promise<Response | null> {
  // Only handle /api/agents/*, /api/messages/*, /api/swarm/*
  if (
    !apiPath.startsWith('/agents') &&
    !apiPath.startsWith('/messages') &&
    !apiPath.startsWith('/swarm')
  ) {
    return null;
  }

  // Check if swarm is enabled
  if (!config.swarm.enabled) {
    return new Response(
      JSON.stringify({ error: 'Agent swarm is not enabled. Set swarm.enabled: true in config.' }),
      { status: 503, headers }
    );
  }

  const service = getSwarmService(config);

  try {
    // === Agent Routes ===

    // GET /api/agents - List agents
    if (apiPath === '/agents' && method === 'GET') {
      const url = new URL(req.url);
      const filter: AgentFilter = {};
      if (url.searchParams.has('status')) {
        filter.status = url.searchParams.get('status') as AgentFilter['status'];
      }
      if (url.searchParams.has('capability')) {
        filter.capability = url.searchParams.get('capability')!;
      }
      if (url.searchParams.has('sessionName')) {
        filter.sessionName = url.searchParams.get('sessionName')!;
      }

      const agents = service.listAgents(filter);
      return new Response(JSON.stringify({ agents }), { headers });
    }

    // POST /api/agents - Register agent
    if (apiPath === '/agents' && method === 'POST') {
      const body = (await req.json()) as RegisterAgentRequest;

      if (!body.sessionName) {
        return new Response(JSON.stringify({ error: 'sessionName is required' }), {
          status: 400,
          headers
        });
      }

      const agent = service.registerAgent(body);
      log.info(`Agent registered: ${agent.id} (${agent.name ?? 'unnamed'})`);
      return new Response(JSON.stringify(agent), { status: 201, headers });
    }

    // GET /api/agents/:id - Get agent
    const agentMatch = apiPath.match(/^\/agents\/([^/]+)$/);
    if (agentMatch && method === 'GET') {
      const agentId = decodeURIComponent(agentMatch[1]!);
      const agent = service.getAgent(agentId);
      if (!agent) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify(agent), { headers });
    }

    // DELETE /api/agents/:id - Unregister agent
    if (agentMatch && method === 'DELETE') {
      const agentId = decodeURIComponent(agentMatch[1]!);
      const success = service.unregisterAgent(agentId);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers
        });
      }
      log.info(`Agent unregistered: ${agentId}`);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // POST /api/agents/:id/heartbeat - Send heartbeat
    const heartbeatMatch = apiPath.match(/^\/agents\/([^/]+)\/heartbeat$/);
    if (heartbeatMatch && method === 'POST') {
      const agentId = decodeURIComponent(heartbeatMatch[1]!);
      const body = (await req.json().catch(() => ({}))) as { status?: string };
      const success = service.heartbeat(
        agentId,
        body.status as 'active' | 'idle' | 'busy' | undefined
      );
      if (!success) {
        return new Response(JSON.stringify({ error: 'Agent not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // === Message Routes ===

    // POST /api/messages - Send message
    if (apiPath === '/messages' && method === 'POST') {
      const body = (await req.json()) as SendMessageRequest;

      if (!body.from || !body.to || !body.type) {
        return new Response(JSON.stringify({ error: 'from, to, and type are required' }), {
          status: 400,
          headers
        });
      }

      const message = service.sendMessage(body);
      return new Response(JSON.stringify(message), { status: 201, headers });
    }

    // GET /api/messages/:agentId/inbox - Get inbox
    const inboxMatch = apiPath.match(/^\/messages\/([^/]+)\/inbox$/);
    if (inboxMatch && method === 'GET') {
      const agentId = decodeURIComponent(inboxMatch[1]!);
      const url = new URL(req.url);
      const filter: MessageFilter = {};
      if (url.searchParams.has('type')) {
        filter.type = url.searchParams.get('type')!;
      }
      if (url.searchParams.has('from')) {
        filter.from = url.searchParams.get('from')!;
      }
      if (url.searchParams.has('acknowledged')) {
        filter.acknowledged = url.searchParams.get('acknowledged') === 'true';
      }
      if (url.searchParams.has('since')) {
        filter.since = url.searchParams.get('since')!;
      }

      const messages = service.getInbox(agentId, filter);
      return new Response(JSON.stringify({ messages }), { headers });
    }

    // POST /api/messages/:agentId/acknowledge - Acknowledge messages
    const ackMatch = apiPath.match(/^\/messages\/([^/]+)\/acknowledge$/);
    if (ackMatch && method === 'POST') {
      const agentId = decodeURIComponent(ackMatch[1]!);
      const body = (await req.json()) as { messageId?: string; messageIds?: string[] };

      if (body.messageId) {
        const success = service.acknowledgeMessage(agentId, body.messageId);
        return new Response(JSON.stringify({ success }), { headers });
      }
      if (body.messageIds) {
        let count = 0;
        for (const id of body.messageIds) {
          if (service.acknowledgeMessage(agentId, id)) count++;
        }
        return new Response(JSON.stringify({ acknowledged: count }), { headers });
      }

      return new Response(JSON.stringify({ error: 'messageId or messageIds required' }), {
        status: 400,
        headers
      });
    }

    // === Swarm Routes (Tasks, Context, Locks) ===

    // GET /api/swarm/status - Get swarm status
    if (apiPath === '/swarm/status' && method === 'GET') {
      const status = service.getStatus();
      return new Response(JSON.stringify(status), { headers });
    }

    // GET /api/swarm/tasks - List tasks
    if (apiPath === '/swarm/tasks' && method === 'GET') {
      const url = new URL(req.url);
      const filter: TaskFilter = {};
      if (url.searchParams.has('status')) {
        filter.status = url.searchParams.get('status') as TaskFilter['status'];
      }
      if (url.searchParams.has('assignedTo')) {
        filter.assignedTo = url.searchParams.get('assignedTo')!;
      }
      if (url.searchParams.has('createdBy')) {
        filter.createdBy = url.searchParams.get('createdBy')!;
      }
      if (url.searchParams.has('available')) {
        // Special filter: available tasks only
        const tasks = service.getAvailableTasks();
        return new Response(JSON.stringify({ tasks }), { headers });
      }

      const tasks = service.listTasks(filter);
      return new Response(JSON.stringify({ tasks }), { headers });
    }

    // POST /api/swarm/tasks - Create task
    if (apiPath === '/swarm/tasks' && method === 'POST') {
      const body = (await req.json()) as CreateTaskRequest;

      if (!body.subject) {
        return new Response(JSON.stringify({ error: 'subject is required' }), {
          status: 400,
          headers
        });
      }

      const task = service.createTask(body);
      log.info(`Task created: ${task.id} - ${task.subject}`);
      return new Response(JSON.stringify(task), { status: 201, headers });
    }

    // GET /api/swarm/tasks/:id - Get task
    const taskMatch = apiPath.match(/^\/swarm\/tasks\/([^/]+)$/);
    if (taskMatch && method === 'GET') {
      const taskId = decodeURIComponent(taskMatch[1]!);
      const task = service.getTask(taskId);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify(task), { headers });
    }

    // PATCH /api/swarm/tasks/:id - Update task
    if (taskMatch && method === 'PATCH') {
      const taskId = decodeURIComponent(taskMatch[1]!);
      const body = (await req.json()) as UpdateTaskRequest;

      const task = service.updateTask(taskId, body);
      if (!task) {
        return new Response(JSON.stringify({ error: 'Task not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify(task), { headers });
    }

    // POST /api/swarm/tasks/:id/claim - Claim task
    const claimMatch = apiPath.match(/^\/swarm\/tasks\/([^/]+)\/claim$/);
    if (claimMatch && method === 'POST') {
      const taskId = decodeURIComponent(claimMatch[1]!);
      const body = (await req.json()) as { agentId: string };

      if (!body.agentId) {
        return new Response(JSON.stringify({ error: 'agentId is required' }), {
          status: 400,
          headers
        });
      }

      const success = service.claimTask(taskId, body.agentId);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Task not found or cannot be claimed' }), {
          status: 400,
          headers
        });
      }

      const task = service.getTask(taskId);
      log.info(`Task claimed: ${taskId} by ${body.agentId}`);
      return new Response(JSON.stringify(task), { headers });
    }

    // === Context Routes ===

    // GET /api/swarm/context - List context
    if (apiPath === '/swarm/context' && method === 'GET') {
      const entries = service.listContext();
      return new Response(JSON.stringify({ entries }), { headers });
    }

    // GET /api/swarm/context/:key - Get context
    const contextGetMatch = apiPath.match(/^\/swarm\/context\/([^/]+)$/);
    if (contextGetMatch && method === 'GET') {
      const key = decodeURIComponent(contextGetMatch[1]!);
      const entry = service.getContext(key);
      if (!entry) {
        return new Response(JSON.stringify({ error: 'Context entry not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify(entry), { headers });
    }

    // PUT /api/swarm/context/:key - Set context
    if (contextGetMatch && method === 'PUT') {
      const key = decodeURIComponent(contextGetMatch[1]!);
      const body = (await req.json()) as Omit<SetContextRequest, 'key'>;

      if (!body.agentId) {
        return new Response(JSON.stringify({ error: 'agentId is required' }), {
          status: 400,
          headers
        });
      }

      const entry = service.setContext({ key, ...body });
      return new Response(JSON.stringify(entry), { headers });
    }

    // DELETE /api/swarm/context/:key - Delete context
    if (contextGetMatch && method === 'DELETE') {
      const key = decodeURIComponent(contextGetMatch[1]!);
      const success = service.deleteContext(key);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Context entry not found' }), {
          status: 404,
          headers
        });
      }
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // === Lock Routes ===

    // GET /api/swarm/locks - List locks
    if (apiPath === '/swarm/locks' && method === 'GET') {
      const locks = service.listLocks();
      return new Response(JSON.stringify({ locks }), { headers });
    }

    // POST /api/swarm/locks/:resource - Acquire lock
    const lockMatch = apiPath.match(/^\/swarm\/locks\/([^/]+)$/);
    if (lockMatch && method === 'POST') {
      const resource = decodeURIComponent(lockMatch[1]!);
      const body = (await req.json()) as { agentId: string; timeoutMs?: number };

      if (!body.agentId) {
        return new Response(JSON.stringify({ error: 'agentId is required' }), {
          status: 400,
          headers
        });
      }

      const success = await service.acquireLock(resource, body.agentId, body.timeoutMs);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Failed to acquire lock', locked: true }), {
          status: 409,
          headers
        });
      }

      const lock = service.getLock(resource);
      log.info(`Lock acquired: ${resource} by ${body.agentId}`);
      return new Response(JSON.stringify(lock), { headers });
    }

    // GET /api/swarm/locks/:resource - Get lock info
    if (lockMatch && method === 'GET') {
      const resource = decodeURIComponent(lockMatch[1]!);
      const lock = service.getLock(resource);
      if (!lock) {
        return new Response(JSON.stringify({ locked: false }), { headers });
      }
      return new Response(JSON.stringify({ locked: true, ...lock }), { headers });
    }

    // DELETE /api/swarm/locks/:resource - Release lock
    if (lockMatch && method === 'DELETE') {
      const resource = decodeURIComponent(lockMatch[1]!);
      const url = new URL(req.url);
      const agentId = url.searchParams.get('agentId');

      if (!agentId) {
        return new Response(JSON.stringify({ error: 'agentId query param required' }), {
          status: 400,
          headers
        });
      }

      const success = service.releaseLock(resource, agentId);
      if (!success) {
        return new Response(JSON.stringify({ error: 'Lock not found or not held by agent' }), {
          status: 400,
          headers
        });
      }

      log.info(`Lock released: ${resource} by ${agentId}`);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    // Not handled by swarm API
    return null;
  } catch (error) {
    log.error('Swarm API error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers
    });
  }
}

/**
 * Get the swarm service instance (for testing)
 */
export function getSwarmServiceInstance(): AgentSwarmService | null {
  return swarmService;
}

/**
 * Reset the swarm service (for testing)
 */
export function resetSwarmService(): void {
  if (swarmService) {
    swarmService.dispose();
    swarmService = null;
  }
}
