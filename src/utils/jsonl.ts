/**
 * JSONL File Utilities
 *
 * Generic utilities for reading and parsing JSONL (JSON Lines) files.
 */

import { readFileSync } from 'node:fs';

/**
 * Read and parse a JSONL file, returning an array of parsed objects.
 * Skips invalid JSON lines silently.
 *
 * @param filePath Path to the JSONL file
 * @returns Array of parsed JSON objects
 */
export function readJsonlFile<T = unknown>(filePath: string): T[] {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseJsonlContent<T>(content);
  } catch {
    return [];
  }
}

/**
 * Parse JSONL content string into an array of objects.
 * Skips invalid JSON lines silently.
 *
 * @param content JSONL content string
 * @returns Array of parsed JSON objects
 */
export function parseJsonlContent<T = unknown>(content: string): T[] {
  const lines = content
    .trim()
    .split('\n')
    .filter((l) => l.trim());
  const results: T[] = [];

  for (const line of lines) {
    try {
      results.push(JSON.parse(line) as T);
    } catch {
      // Skip invalid JSON lines
    }
  }

  return results;
}
