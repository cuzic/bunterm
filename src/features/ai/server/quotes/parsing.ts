/**
 * Claude Session File Parsing
 *
 * Parses Claude Code session JSONL files to extract conversation turns.
 * Uses validated schemas from claude-watcher for type safety.
 */

import {
  type ClaudeAssistantContent,
  ClaudeSessionEntrySchema
} from '@/features/claude-watcher/server/schemas.js';
import { readJsonlFile } from '@/utils/jsonl.js';
import type { ClaudeTurnFull, ClaudeTurnSummary } from './types.js';

/**
 * Parsed assistant content (domain type)
 */
interface ParsedAssistantContent {
  fullText: string;
  hasToolUse: boolean;
  editedFiles: string[];
  toolUses: Array<{ name: string; input: Record<string, unknown> }>;
}

/**
 * Parse content blocks from a validated assistant entry
 */
function parseAssistantContent(blocks: ClaudeAssistantContent[]): ParsedAssistantContent {
  let fullText = '';
  let hasToolUse = false;
  const editedFiles: string[] = [];
  const toolUses: Array<{ name: string; input: Record<string, unknown> }> = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      if (!fullText) {
        fullText = block.text;
      }
    }
    if (block.type === 'tool_use') {
      hasToolUse = true;
      toolUses.push({ name: block.name, input: block.input });
      if (block.name === 'Edit' || block.name === 'Write') {
        const filePath = block.input['file_path'] ?? block.input['path'];
        if (typeof filePath === 'string') {
          editedFiles.push(filePath);
        }
      }
    }
  }

  return { fullText, hasToolUse, editedFiles, toolUses };
}

/**
 * Parse assistant responses from a Claude session file
 * @param sessionFile Path to the session JSONL file
 * @param count Maximum number of responses to return
 * @returns Array of assistant response summaries (newest first)
 */
export function parseTurnsFromSessionFile(sessionFile: string, count: number): ClaudeTurnSummary[] {
  const rawEntries = readJsonlFile<unknown>(sessionFile);
  const turns: ClaudeTurnSummary[] = [];

  for (const raw of rawEntries) {
    // Validate raw entry against schema
    const result = ClaudeSessionEntrySchema.safeParse(raw);
    if (!result.success) {
      continue;
    }

    const entry = result.data;
    if (entry.isMeta || entry.type !== 'assistant' || !Array.isArray(entry.message)) {
      continue;
    }

    const { fullText, hasToolUse, editedFiles } = parseAssistantContent(entry.message);

    // Only include entries with text content that has 3+ lines
    if (fullText && fullText.split('\n').length >= 3) {
      turns.push({
        uuid: entry.uuid,
        assistantSummary: fullText.slice(0, 500),
        timestamp: entry.timestamp,
        hasToolUse,
        editedFiles: editedFiles.length > 0 ? editedFiles : undefined
      });
    }
  }

  return turns.slice(-count).reverse();
}

/**
 * Parse a specific assistant response by UUID from a Claude session file
 * @param sessionFile Path to the session JSONL file
 * @param uuid The assistant response UUID to find
 * @returns Full assistant content or null if not found
 */
export function parseTurnByUuidFromSessionFile(
  sessionFile: string,
  uuid: string
): ClaudeTurnFull | null {
  const rawEntries = readJsonlFile<unknown>(sessionFile);

  for (const raw of rawEntries) {
    // Validate raw entry against schema
    const result = ClaudeSessionEntrySchema.safeParse(raw);
    if (!result.success) {
      continue;
    }

    const entry = result.data;
    if (entry.uuid !== uuid || entry.type !== 'assistant' || !Array.isArray(entry.message)) {
      continue;
    }

    const { fullText, toolUses } = parseAssistantContent(entry.message);

    return {
      uuid,
      assistantContent: fullText,
      timestamp: entry.timestamp,
      toolUses
    };
  }

  return null;
}
