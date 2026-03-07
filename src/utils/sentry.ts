/**
 * Server-side Sentry Integration
 *
 * Provides error monitoring and exception capture using @sentry/bun.
 * Sentry is only initialized if enabled in config and DSN is provided.
 */

import type { SentryConfig } from '@/core/config/types.js';
import { createLogger } from './logger.js';

const log = createLogger('sentry');

let sentryInitialized = false;
let Sentry: typeof import('@sentry/bun') | null = null;

/**
 * Initialize Sentry with the given configuration
 *
 * @param config - Sentry configuration from config.yaml
 * @param version - Application version for release tracking
 */
export async function initSentry(config: SentryConfig, version?: string): Promise<void> {
  if (!config.enabled || !config.dsn) {
    log.debug('Sentry disabled or DSN not configured');
    return;
  }

  try {
    Sentry = await import('@sentry/bun');
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      sampleRate: config.sample_rate,
      tracesSampleRate: config.traces_sample_rate,
      release: config.release ?? version,
      debug: config.debug
    });
    sentryInitialized = true;
    log.info(`Sentry initialized (env=${config.environment})`);
  } catch (error) {
    log.error(`Failed to initialize Sentry: ${String(error)}`);
  }
}

/**
 * Capture an exception and send to Sentry
 *
 * @param error - The error to capture
 * @param context - Additional context to attach to the event
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (!sentryInitialized || !Sentry) {
    return;
  }
  try {
    Sentry.captureException(error, { extra: context });
  } catch (e) {
    log.error(`Failed to capture exception: ${String(e)}`);
  }
}

/**
 * Capture a message and send to Sentry
 *
 * @param message - The message to capture
 * @param level - Severity level (info, warning, error, fatal)
 */
export function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' | 'fatal' = 'info'
): void {
  if (!sentryInitialized || !Sentry) {
    return;
  }
  try {
    Sentry.captureMessage(message, level);
  } catch (e) {
    log.error(`Failed to capture message: ${String(e)}`);
  }
}

/**
 * Check if Sentry has been initialized
 */
export function isSentryEnabled(): boolean {
  return sentryInitialized;
}

/**
 * Reset Sentry state (for testing purposes)
 */
export function resetSentryState(): void {
  sentryInitialized = false;
  Sentry = null;
}
