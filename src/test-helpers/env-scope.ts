/**
 * Safe environment variable scoping for tests.
 *
 * Saves original values before overriding, restores them after the callback
 * completes (even on exception). Prevents env var leaking between parallel tests.
 *
 * @example
 * ```typescript
 * await withEnv({ BUNTERM_STATE_DIR: '/tmp/test' }, async () => {
 *   expect(process.env['BUNTERM_STATE_DIR']).toBe('/tmp/test');
 * });
 * // BUNTERM_STATE_DIR is restored to its original value here
 * ```
 */

type EnvOverrides = Record<string, string>;

/**
 * Run a function with temporary environment variable overrides.
 *
 * - Saves the original value of each key before setting the override.
 * - Restores original values in a finally block (exception-safe).
 * - If the original value was undefined, deletes the key on restore.
 * - Supports both sync and async callbacks.
 */
export async function withEnv<T>(overrides: EnvOverrides, fn: () => T | Promise<T>): Promise<T> {
  const saved = new Map<string, string | undefined>();

  // Save originals and apply overrides
  for (const key of Object.keys(overrides)) {
    saved.set(key, process.env[key]);
    process.env[key] = overrides[key];
  }

  try {
    return await fn();
  } finally {
    // Restore originals
    for (const [key, original] of saved) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

/**
 * Synchronous version of withEnv for use in non-async test callbacks.
 *
 * Prefer the async `withEnv` unless you specifically need synchronous execution.
 */
/**
 * Run a function with specified environment variables temporarily removed.
 *
 * Saves the original values, deletes the keys, runs the callback,
 * then restores the originals. Exception-safe.
 *
 * @example
 * ```typescript
 * withoutEnvSync(['TMUX'], () => {
 *   expect(process.env['TMUX']).toBeUndefined();
 * });
 * ```
 */
export function withoutEnvSync<T>(keys: string[], fn: () => T): T {
  const saved = new Map<string, string | undefined>();

  for (const key of keys) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }

  try {
    return fn();
  } finally {
    for (const [key, original] of saved) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}

export function withEnvSync<T>(overrides: EnvOverrides, fn: () => T): T {
  const saved = new Map<string, string | undefined>();

  for (const key of Object.keys(overrides)) {
    saved.set(key, process.env[key]);
    process.env[key] = overrides[key];
  }

  try {
    return fn();
  } finally {
    for (const [key, original] of saved) {
      if (original === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original;
      }
    }
  }
}
