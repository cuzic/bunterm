/**
 * Claude Watcher Schemas
 *
 * Zod schemas for validating Claude Code session file formats.
 */

import { z } from 'zod';

// === Claude History Entry Schema ===

export const ClaudeHistoryEntrySchema = z.object({
  display: z.string(),
  pastedContents: z.record(z.string(), z.string()),
  timestamp: z.number(),
  project: z.string(),
  sessionId: z.string().optional()
});

export type ClaudeHistoryEntry = z.infer<typeof ClaudeHistoryEntrySchema>;

// === Claude Session Entry Schemas ===

export const ClaudeUserMessageSchema = z.object({
  role: z.literal('user'),
  content: z.string()
});

export type ClaudeUserMessage = z.infer<typeof ClaudeUserMessageSchema>;

export const ClaudeTextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string()
});

export const ClaudeThinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  signature: z.string().optional()
});

export const ClaudeToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.string(), z.unknown()),
  caller: z
    .object({
      type: z.string()
    })
    .optional()
});

export const ClaudeToolResultContentSchema = z.object({
  type: z.enum(['text', 'image']),
  text: z.string().optional(),
  source: z
    .object({
      type: z.string(),
      media_type: z.string(),
      data: z.string()
    })
    .optional()
});

export const ClaudeToolResultBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(ClaudeToolResultContentSchema)]),
  is_error: z.boolean().optional()
});

export const ClaudeAssistantContentSchema = z.discriminatedUnion('type', [
  ClaudeTextBlockSchema,
  ClaudeThinkingBlockSchema,
  ClaudeToolUseBlockSchema,
  ClaudeToolResultBlockSchema
]);

export type ClaudeAssistantContent = z.infer<typeof ClaudeAssistantContentSchema>;

// New format: message is an API response object with content array
const ClaudeApiResponseSchema = z.object({
  role: z.literal('assistant'),
  content: z.array(ClaudeAssistantContentSchema)
}).passthrough();

export const ClaudeSessionEntrySchema = z.object({
  type: z.enum(['user', 'assistant']),
  message: z.union([
    ClaudeUserMessageSchema,
    z.array(ClaudeAssistantContentSchema),
    ClaudeApiResponseSchema
  ]),
  uuid: z.string(),
  parentUuid: z.string().nullable(),
  timestamp: z.string(),
  sessionId: z.string(),
  cwd: z.string().optional(),
  version: z.string().optional(),
  gitBranch: z.string().optional(),
  slug: z.string().optional(),
  isMeta: z.boolean().optional(),
  isSidechain: z.boolean().optional(),
  userType: z.string().optional()
});

export type ClaudeSessionEntry = z.infer<typeof ClaudeSessionEntrySchema>;

// === Parse Helpers ===

/**
 * Parse a history.jsonl line with schema validation
 */
export function parseHistoryEntry(line: string): ClaudeHistoryEntry | null {
  try {
    const parsed: unknown = JSON.parse(line);
    const result = ClaudeHistoryEntrySchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a session.jsonl line with schema validation
 */
export function parseSessionEntry(line: string): ClaudeSessionEntry | null {
  try {
    const parsed: unknown = JSON.parse(line);
    const result = ClaudeSessionEntrySchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}
