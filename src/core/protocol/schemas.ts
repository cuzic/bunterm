/**
 * Protocol Message Schemas
 *
 * Zod schemas for validating WebSocket messages at the boundary.
 * These schemas ensure type-safe message parsing and prevent
 * malformed messages from causing runtime errors.
 */

import { z } from 'zod';

// === Client → Server Message Schemas ===

export const InputMessageSchema = z.object({
  type: z.literal('input'),
  data: z.string()
});

export const ResizeMessageSchema = z.object({
  type: z.literal('resize'),
  cols: z.number().int().positive(),
  rows: z.number().int().positive()
});

export const PingMessageSchema = z.object({
  type: z.literal('ping')
});

export const WatchFileMessageSchema = z.object({
  type: z.literal('watchFile'),
  path: z.string().min(1)
});

export const UnwatchFileMessageSchema = z.object({
  type: z.literal('unwatchFile'),
  path: z.string().min(1)
});

export const WatchDirMessageSchema = z.object({
  type: z.literal('watchDir'),
  path: z.string().min(1)
});

export const UnwatchDirMessageSchema = z.object({
  type: z.literal('unwatchDir'),
  path: z.string().min(1)
});

export const ReplayRequestMessageSchema = z.object({
  type: z.literal('replayRequest')
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  InputMessageSchema,
  ResizeMessageSchema,
  PingMessageSchema,
  WatchFileMessageSchema,
  UnwatchFileMessageSchema,
  WatchDirMessageSchema,
  UnwatchDirMessageSchema,
  ReplayRequestMessageSchema
]);

export type ValidatedClientMessage = z.infer<typeof ClientMessageSchema>;

// === Server → Client Message Schemas ===

export const OutputMessageSchema = z.object({
  type: z.literal('output'),
  data: z.string() // Base64 encoded
});

export const TitleMessageSchema = z.object({
  type: z.literal('title'),
  title: z.string()
});

export const ExitMessageSchema = z.object({
  type: z.literal('exit'),
  code: z.number().int()
});

export const PongMessageSchema = z.object({
  type: z.literal('pong')
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string()
});

export const BellMessageSchema = z.object({
  type: z.literal('bell')
});

export const FileChangeMessageSchema = z.object({
  type: z.literal('fileChange'),
  path: z.string(),
  timestamp: z.number()
});

// Block-related schemas
export const BlockStatusSchema = z.enum(['running', 'success', 'error']);

export const BlockSchema = z.object({
  id: z.string(),
  command: z.string(),
  output: z.string(), // Base64 encoded
  startedAt: z.string(),
  endedAt: z.string().optional(),
  exitCode: z.number().int().optional(),
  cwd: z.string().optional(),
  status: BlockStatusSchema,
  startLine: z.number().int(),
  endLine: z.number().int().optional()
});

export const BlockStartMessageSchema = z.object({
  type: z.literal('blockStart'),
  block: BlockSchema
});

export const BlockEndMessageSchema = z.object({
  type: z.literal('blockEnd'),
  blockId: z.string(),
  exitCode: z.number().int(),
  endedAt: z.string(),
  endLine: z.number().int()
});

export const BlockOutputMessageSchema = z.object({
  type: z.literal('blockOutput'),
  blockId: z.string(),
  data: z.string() // Base64 encoded
});

export const BlockListMessageSchema = z.object({
  type: z.literal('blockList'),
  blocks: z.array(BlockSchema)
});

// === AI Message Schemas ===

export const AICitationSchema = z.object({
  blockId: z.string(),
  reason: z.string(),
  excerpt: z.string().optional()
});

export const AINextCommandSchema = z.object({
  command: z.string(),
  description: z.string(),
  risk: z.enum(['safe', 'caution', 'dangerous'])
});

export const AIStreamMessageSchema = z.object({
  type: z.literal('ai_stream'),
  runId: z.string(),
  seq: z.number(),
  delta: z.string()
});

export const AIFinalMessageSchema = z.object({
  type: z.literal('ai_final'),
  runId: z.string(),
  result: z.object({
    content: z.string(),
    citations: z.array(AICitationSchema),
    nextCommands: z.array(AINextCommandSchema)
  }),
  usage: z.object({
    inputTokens: z.number(),
    outputTokens: z.number()
  }),
  elapsedMs: z.number()
});

export const AIErrorMessageSchema = z.object({
  type: z.literal('ai_error'),
  runId: z.string(),
  error: z.string(),
  code: z.enum(['timeout', 'canceled', 'runner_error', 'rate_limited', 'unknown'])
});

export const AIRunStartedMessageSchema = z.object({
  type: z.literal('ai_run_started'),
  runId: z.string(),
  runner: z.string()
});

// === Claude Watcher Message Schemas ===

export const ClaudeUserMessageWSSchema = z.object({
  type: z.literal('claudeUserMessage'),
  uuid: z.string(),
  text: z.string(),
  timestamp: z.string()
});

export const ClaudeAssistantTextWSSchema = z.object({
  type: z.literal('claudeAssistantText'),
  uuid: z.string(),
  text: z.string(),
  timestamp: z.string()
});

export const ClaudeThinkingWSSchema = z.object({
  type: z.literal('claudeThinking'),
  uuid: z.string(),
  thinking: z.string(),
  timestamp: z.string()
});

export const ClaudeToolUseWSSchema = z.object({
  type: z.literal('claudeToolUse'),
  uuid: z.string(),
  toolName: z.string(),
  toolInput: z.unknown(),
  timestamp: z.string()
});

export const ClaudeToolResultWSSchema = z.object({
  type: z.literal('claudeToolResult'),
  uuid: z.string(),
  result: z.unknown(),
  timestamp: z.string()
});

export const ClaudeSessionStartWSSchema = z.object({
  type: z.literal('claudeSessionStart'),
  sessionId: z.string(),
  projectPath: z.string(),
  timestamp: z.string()
});

export const ClaudeSessionEndWSSchema = z.object({
  type: z.literal('claudeSessionEnd'),
  sessionId: z.string(),
  timestamp: z.string()
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  // Core messages
  OutputMessageSchema,
  TitleMessageSchema,
  ExitMessageSchema,
  PongMessageSchema,
  ErrorMessageSchema,
  BellMessageSchema,
  FileChangeMessageSchema,
  // Block messages
  BlockStartMessageSchema,
  BlockEndMessageSchema,
  BlockOutputMessageSchema,
  BlockListMessageSchema,
  // AI messages
  AIStreamMessageSchema,
  AIFinalMessageSchema,
  AIErrorMessageSchema,
  AIRunStartedMessageSchema,
  // Claude watcher messages
  ClaudeUserMessageWSSchema,
  ClaudeAssistantTextWSSchema,
  ClaudeThinkingWSSchema,
  ClaudeToolUseWSSchema,
  ClaudeToolResultWSSchema,
  ClaudeSessionStartWSSchema,
  ClaudeSessionEndWSSchema
]);

export type ValidatedServerMessage = z.infer<typeof ServerMessageSchema>;
