/**
 * Claude Session Message Parser
 *
 * Parses Claude Code session JSONL entries into WebSocket messages.
 */

import type {
  ClaudeAssistantContent,
  ClaudeAssistantTextWS,
  ClaudeHistoryEntry,
  ClaudeSessionEntry,
  ClaudeThinkingWS,
  ClaudeToolResultBlock,
  ClaudeToolResultWS,
  ClaudeToolUseWS,
  ClaudeUserMessage,
  ClaudeUserMessageWS,
  ClaudeWatcherMessage
} from './types.js';

export interface ParserOptions {
  /** Include thinking blocks in output */
  includeThinking?: boolean;
  /** Maximum tool result content size before truncation */
  maxToolResultSize?: number;
}

const DEFAULT_OPTIONS: Required<ParserOptions> = {
  includeThinking: true,
  maxToolResultSize: 10000
};

/**
 * Parse a history.jsonl line
 */
export function parseHistoryEntry(line: string): ClaudeHistoryEntry | null {
  try {
    const entry = JSON.parse(line) as ClaudeHistoryEntry;
    if (typeof entry.display !== 'string' || typeof entry.timestamp !== 'number') {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Parse a session.jsonl line
 */
export function parseSessionEntry(line: string): ClaudeSessionEntry | null {
  try {
    const entry = JSON.parse(line) as ClaudeSessionEntry;
    if (!entry.type || !entry.uuid || !entry.message) {
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Check if a message is a user message
 */
function isUserMessage(message: unknown): message is ClaudeUserMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'role' in message &&
    (message as ClaudeUserMessage).role === 'user'
  );
}

/**
 * Check if a message is an assistant content array
 */
function isAssistantContent(message: unknown): message is ClaudeAssistantContent[] {
  return Array.isArray(message);
}

/**
 * Extract text content from tool result
 */
function extractToolResultContent(block: ClaudeToolResultBlock, maxSize: number): string {
  if (typeof block.content === 'string') {
    return block.content.length > maxSize
      ? `${block.content.slice(0, maxSize)}... [truncated]`
      : block.content;
  }

  // Handle array of content blocks
  const textParts: string[] = [];
  for (const item of block.content) {
    if (item.type === 'text' && item.text) {
      textParts.push(item.text);
    } else if (item.type === 'image') {
      textParts.push('[image]');
    }
  }

  const combined = textParts.join('\n');
  return combined.length > maxSize ? `${combined.slice(0, maxSize)}... [truncated]` : combined;
}

/**
 * Convert a session entry to WebSocket messages
 */
export function sessionEntryToMessages(
  entry: ClaudeSessionEntry,
  options: ParserOptions = {}
): ClaudeWatcherMessage[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const messages: ClaudeWatcherMessage[] = [];

  // Skip meta entries
  if (entry.isMeta) {
    return messages;
  }

  // Handle user messages
  if (entry.type === 'user' && isUserMessage(entry.message)) {
    const userMsg: ClaudeUserMessageWS = {
      type: 'claudeUserMessage',
      uuid: entry.uuid,
      content: entry.message.content,
      timestamp: entry.timestamp,
      sessionId: entry.sessionId
    };
    messages.push(userMsg);
    return messages;
  }

  // Handle assistant messages
  if (entry.type === 'assistant' && isAssistantContent(entry.message)) {
    for (const block of entry.message) {
      switch (block.type) {
        case 'text': {
          const textMsg: ClaudeAssistantTextWS = {
            type: 'claudeAssistantText',
            uuid: entry.uuid,
            text: block.text,
            timestamp: entry.timestamp
          };
          messages.push(textMsg);
          break;
        }

        case 'thinking': {
          if (opts.includeThinking) {
            const thinkingMsg: ClaudeThinkingWS = {
              type: 'claudeThinking',
              uuid: entry.uuid,
              thinking: block.thinking,
              timestamp: entry.timestamp
            };
            messages.push(thinkingMsg);
          }
          break;
        }

        case 'tool_use': {
          const toolUseMsg: ClaudeToolUseWS = {
            type: 'claudeToolUse',
            uuid: entry.uuid,
            toolId: block.id,
            toolName: block.name,
            input: block.input,
            timestamp: entry.timestamp
          };
          messages.push(toolUseMsg);
          break;
        }

        case 'tool_result': {
          const toolResultMsg: ClaudeToolResultWS = {
            type: 'claudeToolResult',
            uuid: entry.uuid,
            toolId: block.tool_use_id,
            content: extractToolResultContent(block, opts.maxToolResultSize),
            isError: block.is_error ?? false,
            timestamp: entry.timestamp
          };
          messages.push(toolResultMsg);
          break;
        }
      }
    }
  }

  return messages;
}

/**
 * Parse multiple JSONL lines and convert to messages
 */
export function parseSessionLines(
  lines: string[],
  options: ParserOptions = {}
): ClaudeWatcherMessage[] {
  const messages: ClaudeWatcherMessage[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const entry = parseSessionEntry(trimmed);
    if (entry) {
      messages.push(...sessionEntryToMessages(entry, options));
    }
  }

  return messages;
}
