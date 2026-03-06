/**
 * Agent Swarm Type Definitions
 *
 * Types for multi-agent communication and coordination system.
 */

import { z } from 'zod';

// === Agent Types ===

export type AgentStatus = 'active' | 'idle' | 'busy' | 'offline';

export interface AgentInfo {
  /** Unique agent identifier */
  id: string;
  /** Session name where agent is running */
  sessionName: string;
  /** Human-readable agent name (e.g., "planner", "coder", "tester") */
  name?: string;
  /** Agent role description */
  role?: string;
  /** List of capabilities (e.g., ["code", "test", "plan"]) */
  capabilities: string[];
  /** Current agent status */
  status: AgentStatus;
  /** Registration timestamp */
  registeredAt: string;
  /** Last heartbeat timestamp */
  lastHeartbeat: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface RegisterAgentRequest {
  sessionName: string;
  name?: string;
  role?: string;
  capabilities?: string[];
  metadata?: Record<string, unknown>;
}

export interface AgentFilter {
  status?: AgentStatus;
  capability?: string;
  sessionName?: string;
  name?: string;
}

// === Message Types ===

export interface AgentMessage {
  /** Unique message identifier */
  id: string;
  /** Message type (e.g., "task.assign", "status.update", "result.ready") */
  type: string;
  /** Sender agent ID */
  from: string;
  /** Recipient agent ID or '*' for broadcast */
  to: string;
  /** Message payload */
  payload: unknown;
  /** Optional reply-to message ID for threading */
  replyTo?: string;
  /** Message timestamp */
  timestamp: string;
  /** Whether message has been acknowledged */
  acknowledged?: boolean;
  /** Acknowledgement timestamp */
  acknowledgedAt?: string;
}

export interface SendMessageRequest {
  type: string;
  from: string;
  to: string;
  payload: unknown;
  replyTo?: string;
}

export interface MessageFilter {
  type?: string;
  from?: string;
  acknowledged?: boolean;
  since?: string;
}

// === Task Types ===

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'canceled';

export interface TaskState {
  /** Unique task identifier */
  id: string;
  /** Task subject/title */
  subject: string;
  /** Detailed description */
  description?: string;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent ID */
  assignedTo?: string;
  /** Agent ID who created this task */
  createdBy?: string;
  /** Task IDs that must complete before this one can start */
  blockedBy?: string[];
  /** Task IDs that are blocked by this one */
  blocks?: string[];
  /** Task priority (higher = more important) */
  priority?: number;
  /** Optional tags for filtering */
  tags?: string[];
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Result data */
  result?: unknown;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

export interface CreateTaskRequest {
  subject: string;
  description?: string;
  assignedTo?: string;
  createdBy?: string;
  blockedBy?: string[];
  priority?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateTaskRequest {
  subject?: string;
  description?: string;
  status?: TaskStatus;
  assignedTo?: string;
  addBlockedBy?: string[];
  removeBlockedBy?: string[];
  addBlocks?: string[];
  removeBlocks?: string[];
  priority?: number;
  tags?: string[];
  result?: unknown;
  metadata?: Record<string, unknown>;
}

export interface TaskFilter {
  status?: TaskStatus;
  assignedTo?: string;
  createdBy?: string;
  tag?: string;
  blockedByNone?: boolean;
}

// === Context Types ===

export interface ContextEntry {
  /** Context key */
  key: string;
  /** Context value */
  value: unknown;
  /** Agent ID who set this entry */
  setBy: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Optional TTL in milliseconds */
  ttlMs?: number;
  /** Expiration timestamp (if TTL is set) */
  expiresAt?: string;
}

export interface SetContextRequest {
  key: string;
  value: unknown;
  agentId: string;
  ttlMs?: number;
}

// === Lock Types ===

export interface LockState {
  /** Resource identifier */
  resource: string;
  /** Agent ID holding the lock */
  heldBy: string;
  /** Lock acquisition timestamp */
  acquiredAt: string;
  /** Lock expiration timestamp */
  expiresAt: string;
}

export interface AcquireLockRequest {
  resource: string;
  agentId: string;
  timeoutMs?: number;
}

// === Event Types ===

export type SwarmEventType =
  | 'agent.registered'
  | 'agent.unregistered'
  | 'agent.status_changed'
  | 'message.sent'
  | 'message.broadcast'
  | 'task.created'
  | 'task.claimed'
  | 'task.updated'
  | 'task.completed'
  | 'context.set'
  | 'context.deleted'
  | 'lock.acquired'
  | 'lock.released';

export interface SwarmEvent {
  /** Event sequence number */
  seq: number;
  /** Event type */
  type: SwarmEventType;
  /** Event timestamp */
  timestamp: string;
  /** Event payload */
  data: unknown;
}

// === Configuration ===

export const SwarmConfigSchema = z.object({
  enabled: z.boolean().default(true),
  heartbeat_timeout_ms: z.number().int().min(1000).max(300000).default(30000),
  max_agents: z.number().int().min(1).max(100).default(20),
  message_history_limit: z.number().int().min(100).max(10000).default(1000),
  task_history_limit: z.number().int().min(100).max(10000).default(500),
  context_max_entries: z.number().int().min(10).max(1000).default(100),
  lock_default_timeout_ms: z.number().int().min(1000).max(600000).default(60000)
});

export type SwarmConfig = z.infer<typeof SwarmConfigSchema>;

/** Default swarm configuration */
export const DEFAULT_SWARM_CONFIG: SwarmConfig = {
  enabled: true,
  heartbeat_timeout_ms: 30000,
  max_agents: 20,
  message_history_limit: 1000,
  task_history_limit: 500,
  context_max_entries: 100,
  lock_default_timeout_ms: 60000
};

// === API Response Types ===

export interface SwarmStatusResponse {
  agents: AgentInfo[];
  tasks: {
    pending: number;
    in_progress: number;
    completed: number;
    blocked: number;
  };
  messages: {
    total: number;
    unacknowledged: number;
  };
  locks: LockState[];
}
