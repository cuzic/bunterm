/**
 * Protocol Helper Functions
 *
 * Functions for parsing client messages and serializing server messages.
 */

import type {
  Block,
  BlockEndMessage,
  BlockListMessage,
  BlockOutputMessage,
  BlockStartMessage
} from './blocks.js';
import type { ServerMessage } from './index.js';
import type {
  BellMessage,
  ClientMessage,
  ErrorMessage,
  ExitMessage,
  FileChangeMessage,
  OutputMessage,
  PongMessage,
  TitleMessage
} from './messages.js';
import {
  ClientMessageSchema,
  ServerMessageSchema,
  type ValidatedClientMessage,
  type ValidatedServerMessage
} from './schemas.js';

/**
 * Parse a client message from JSON string using schema validation
 *
 * @returns Validated ClientMessage or null if parsing/validation fails
 */
export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = ClientMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data as ClientMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a client message with detailed error information
 *
 * @returns Result with validated message or parse error details
 */
export function parseClientMessageSafe(data: string):
  | {
      ok: true;
      value: ValidatedClientMessage;
    }
  | {
      ok: false;
      error: string;
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }

  const result = ClientMessageSchema.safeParse(parsed);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'unknown';
  return {
    ok: false,
    error: `Validation failed at '${field}': ${issue?.message || 'unknown error'}`
  };
}

/**
 * Parse a server message from JSON string using schema validation
 *
 * @returns Validated ServerMessage or null if parsing/validation fails
 */
export function parseServerMessage(data: string): ServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(data);
    const result = ServerMessageSchema.safeParse(parsed);
    if (result.success) {
      return result.data as ServerMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse a server message with detailed error information
 *
 * @returns Result with validated message or parse error details
 */
export function parseServerMessageSafe(data: string):
  | {
      ok: true;
      value: ValidatedServerMessage;
    }
  | {
      ok: false;
      error: string;
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (e) {
    return { ok: false, error: `Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}` };
  }

  const result = ServerMessageSchema.safeParse(parsed);
  if (result.success) {
    return { ok: true, value: result.data };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'unknown';
  return {
    ok: false,
    error: `Validation failed at '${field}': ${issue?.message || 'unknown error'}`
  };
}

/**
 * Serialize a server message to JSON string
 */
export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

/**
 * Create an output message from raw PTY data
 */
export function createOutputMessage(data: Buffer | Uint8Array): OutputMessage {
  const base64 = Buffer.from(data).toString('base64');
  return { type: 'output', data: base64 };
}

/**
 * Create an error message
 */
export function createErrorMessage(message: string): ErrorMessage {
  return { type: 'error', message };
}

/**
 * Create an exit message
 */
export function createExitMessage(code: number): ExitMessage {
  return { type: 'exit', code };
}

/**
 * Create a title message
 */
export function createTitleMessage(title: string): TitleMessage {
  return { type: 'title', title };
}

/**
 * Create a pong message
 */
export function createPongMessage(): PongMessage {
  return { type: 'pong' };
}

/**
 * Create a bell message
 */
export function createBellMessage(): BellMessage {
  return { type: 'bell' };
}

/**
 * Create a file change message
 */
export function createFileChangeMessage(path: string): FileChangeMessage {
  return { type: 'fileChange', path, timestamp: Date.now() };
}

/**
 * Create a block start message
 */
export function createBlockStartMessage(block: Block): BlockStartMessage {
  return { type: 'blockStart', block };
}

/**
 * Create a block end message
 */
export function createBlockEndMessage(
  blockId: string,
  exitCode: number,
  endedAt: string,
  endLine: number
): BlockEndMessage {
  return { type: 'blockEnd', blockId, exitCode, endedAt, endLine };
}

/**
 * Create a block output message
 */
export function createBlockOutputMessage(blockId: string, data: string): BlockOutputMessage {
  return { type: 'blockOutput', blockId, data };
}

/**
 * Create a block list message
 */
export function createBlockListMessage(blocks: Block[]): BlockListMessage {
  return { type: 'blockList', blocks };
}
