/**
 * Test setup - sets environment variables before any modules are loaded
 * This file is imported first by test files to ensure proper test isolation
 */

import { existsSync, mkdirSync, rmSync } from 'node:fs';

// Use a shared test state directory for all tests
export const TEST_STATE_DIR = `/tmp/bunterm-test-${process.pid}`;

// Use a shared test config directory for config tests
export const TEST_CONFIG_DIR = `/tmp/bunterm-test-config-${process.pid}`;

// Set test state directory immediately when this module is loaded
process.env['BUNTERM_STATE_DIR'] = TEST_STATE_DIR;

/**
 * Reset test state directory - call in beforeEach
 * This ensures each test starts with a clean state directory.
 */
export function resetTestState(): void {
  if (existsSync(TEST_STATE_DIR)) {
    rmSync(TEST_STATE_DIR, { recursive: true });
  }
  mkdirSync(TEST_STATE_DIR, { recursive: true });
}

/**
 * Cleanup test state directory - call in afterAll
 * This removes the test directory after all tests in the suite complete.
 * Note: beforeEach already handles cleanup before each test, so this is
 * only needed for final cleanup after the test suite.
 */
export function cleanupTestState(): void {
  if (existsSync(TEST_STATE_DIR)) {
    rmSync(TEST_STATE_DIR, { recursive: true });
  }
}
