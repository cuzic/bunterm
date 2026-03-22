/**
 * Environment Variable Validation
 *
 * Validates environment variables at startup and provides typed access.
 */

import { z } from 'zod';

// === Schemas ===

/**
 * Log level enum
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']).default('info');
export type LogLevel = z.infer<typeof LogLevelSchema>;

/**
 * Environment schema for bunterm-specific variables
 */
export const BuntermEnvSchema = z.object({
  /** Config directory override */
  BUNTERM_CONFIG_DIR: z.string().optional(),

  /** State directory override */
  BUNTERM_STATE_DIR: z.string().optional(),

  /** Log file path */
  BUNTERM_LOG_FILE: z.string().optional(),

  /** Log level */
  BUNTERM_LOG_LEVEL: LogLevelSchema.optional(),

  /** WebSocket authentication secret */
  BUNTERM_WS_SECRET: z.string().min(16).optional(),

  /** Daemon port override (rarely used) */
  BUNTERM_DAEMON_PORT: z.coerce.number().int().min(1024).max(65535).optional()
});

export type BuntermEnv = z.infer<typeof BuntermEnvSchema>;

/**
 * System environment schema
 */
export const SystemEnvSchema = z.object({
  /** User's home directory */
  HOME: z.string().min(1),

  /** Default shell */
  SHELL: z.string().optional(),

  /** tmux session indicator (presence indicates inside tmux) */
  TMUX: z.string().optional()
});

export type SystemEnv = z.infer<typeof SystemEnvSchema>;

// === Cached Environment ===

let cachedBuntermEnv: BuntermEnv | null = null;
let cachedSystemEnv: SystemEnv | null = null;

// === Parse Functions ===

/**
 * Parse and validate bunterm environment variables
 * Returns validated env or null on validation failure
 */
export function parseBuntermEnv(): BuntermEnv | null {
  if (cachedBuntermEnv) {
    return cachedBuntermEnv;
  }

  const raw = {
    BUNTERM_CONFIG_DIR: process.env['BUNTERM_CONFIG_DIR'],
    BUNTERM_STATE_DIR: process.env['BUNTERM_STATE_DIR'],
    BUNTERM_LOG_FILE: process.env['BUNTERM_LOG_FILE'],
    BUNTERM_LOG_LEVEL: process.env['BUNTERM_LOG_LEVEL'],
    BUNTERM_WS_SECRET: process.env['BUNTERM_WS_SECRET'],
    BUNTERM_DAEMON_PORT: process.env['BUNTERM_DAEMON_PORT']
  };

  const result = BuntermEnvSchema.safeParse(raw);
  if (result.success) {
    cachedBuntermEnv = result.data;
    return result.data;
  }
  return null;
}

/**
 * Parse and validate system environment variables
 */
export function parseSystemEnv(): SystemEnv | null {
  if (cachedSystemEnv) {
    return cachedSystemEnv;
  }

  const raw = {
    HOME: process.env['HOME'],
    SHELL: process.env['SHELL'],
    TMUX: process.env['TMUX']
  };

  const result = SystemEnvSchema.safeParse(raw);
  if (result.success) {
    cachedSystemEnv = result.data;
    return result.data;
  }
  return null;
}

/**
 * Validate all environment variables at startup
 * Returns validation errors if any
 */
export function validateEnvAtStartup(): string[] {
  const errors: string[] = [];

  // Validate bunterm env
  const buntermRaw = {
    BUNTERM_CONFIG_DIR: process.env['BUNTERM_CONFIG_DIR'],
    BUNTERM_STATE_DIR: process.env['BUNTERM_STATE_DIR'],
    BUNTERM_LOG_FILE: process.env['BUNTERM_LOG_FILE'],
    BUNTERM_LOG_LEVEL: process.env['BUNTERM_LOG_LEVEL'],
    BUNTERM_WS_SECRET: process.env['BUNTERM_WS_SECRET'],
    BUNTERM_DAEMON_PORT: process.env['BUNTERM_DAEMON_PORT']
  };

  const buntermResult = BuntermEnvSchema.safeParse(buntermRaw);
  if (!buntermResult.success) {
    for (const issue of buntermResult.error.issues) {
      const field = issue.path.join('.') || 'unknown';
      errors.push(`Invalid environment variable ${field}: ${issue.message}`);
    }
  }

  // Validate system env
  const systemRaw = {
    HOME: process.env['HOME'],
    SHELL: process.env['SHELL'],
    TMUX: process.env['TMUX']
  };

  const systemResult = SystemEnvSchema.safeParse(systemRaw);
  if (!systemResult.success) {
    for (const issue of systemResult.error.issues) {
      const field = issue.path.join('.') || 'unknown';
      errors.push(`Invalid environment variable ${field}: ${issue.message}`);
    }
  }

  return errors;
}

// === Typed Accessors ===

/**
 * Get bunterm config directory (with fallback)
 */
export function getConfigDir(fallback: string): string {
  const env = parseBuntermEnv();
  return env?.BUNTERM_CONFIG_DIR ?? fallback;
}

/**
 * Get bunterm state directory (with fallback)
 */
export function getStateDir(fallback: string): string {
  const env = parseBuntermEnv();
  return env?.BUNTERM_STATE_DIR ?? fallback;
}

/**
 * Get log level
 */
export function getLogLevel(): LogLevel {
  const env = parseBuntermEnv();
  return env?.BUNTERM_LOG_LEVEL ?? 'info';
}

/**
 * Get log file path
 */
export function getLogFile(): string | null {
  const env = parseBuntermEnv();
  return env?.BUNTERM_LOG_FILE ?? null;
}

/**
 * Check if running inside tmux
 */
export function isInsideTmux(): boolean {
  const env = parseSystemEnv();
  return !!env?.TMUX;
}

/**
 * Get default shell
 */
export function getDefaultShell(): string {
  const env = parseSystemEnv();
  return env?.SHELL ?? '/bin/bash';
}

/**
 * Get home directory
 */
export function getHomeDir(): string {
  const env = parseSystemEnv();
  return env?.HOME ?? '/tmp';
}

/**
 * Clear cached environment (for testing)
 */
export function clearEnvCache(): void {
  cachedBuntermEnv = null;
  cachedSystemEnv = null;
}
