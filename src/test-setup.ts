/**
 * Test setup - provides helpers for test isolation.
 *
 * Each call to resetTestState() creates a unique temporary directory
 * and sets BUNTERM_STATE_DIR, preventing parallel-test interference.
 * cleanupTestState() restores the original env var and removes the directory.
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Use a shared test config directory for config tests (unchanged)
export const TEST_CONFIG_DIR = `/tmp/bunterm-test-config-${process.pid}`;

// Per-test unique state directory
let currentTestStateDir: string | null = null;
let savedStateDir: string | undefined;

/**
 * Reset test state directory - call in beforeEach.
 * Creates a unique directory per call and sets BUNTERM_STATE_DIR.
 */
export function resetTestState(): string {
  // Clean up previous directory if any
  if (currentTestStateDir && existsSync(currentTestStateDir)) {
    rmSync(currentTestStateDir, { recursive: true });
  }

  // Generate a unique directory
  currentTestStateDir = join(
    tmpdir(),
    `bunterm-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  mkdirSync(currentTestStateDir, { recursive: true });

  // Save and override env var
  savedStateDir = process.env['BUNTERM_STATE_DIR'];
  process.env['BUNTERM_STATE_DIR'] = currentTestStateDir;

  return currentTestStateDir;
}

/**
 * Cleanup test state directory - call in afterEach/afterAll.
 * Restores the original BUNTERM_STATE_DIR and removes the temp directory.
 */
export function cleanupTestState(): void {
  // Restore env var
  if (savedStateDir !== undefined) {
    process.env['BUNTERM_STATE_DIR'] = savedStateDir;
  } else {
    delete process.env['BUNTERM_STATE_DIR'];
  }

  // Remove temp directory
  if (currentTestStateDir && existsSync(currentTestStateDir)) {
    rmSync(currentTestStateDir, { recursive: true });
  }
  currentTestStateDir = null;
}

/**
 * Get the current test state directory.
 * Throws if resetTestState() has not been called.
 */
export function getTestStateDir(): string {
  if (!currentTestStateDir) {
    throw new Error('resetTestState() must be called before getTestStateDir()');
  }
  return currentTestStateDir;
}
