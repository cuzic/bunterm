/**
 * Terminal UI Module
 *
 * Provides enhanced UI for terminal sessions with:
 * - IME input support for Japanese
 * - Font size zoom controls
 * - Copy/paste functionality
 * - Touch gesture support
 * - Modifier key buttons (Ctrl, Alt, Shift)
 * - Scrollback search
 * - File transfer
 * - Push notifications
 * - HTML preview
 * - Command snippets
 * - Sentry error monitoring (client-side)
 */

import {
  DEFAULT_PREVIEW_CONFIG,
  DEFAULT_SENTRY_CONFIG,
  DEFAULT_TERMINAL_UI_CONFIG,
  type SentryConfig,
  type TerminalUiConfig
} from '@/config/types.js';
import {
  AUTO_RUN_KEY,
  CLIPBOARD_HISTORY_KEY,
  ONBOARDING_SHOWN_KEY,
  SNIPPETS_KEY,
  STORAGE_KEY
} from './config.js';
import { terminalUiStyles } from './styles.js';
import { onboardingHtml, terminalUiHtml } from './template.js';

// Re-export config constants (localStorage keys only)
export { AUTO_RUN_KEY, CLIPBOARD_HISTORY_KEY, ONBOARDING_SHOWN_KEY, SNIPPETS_KEY, STORAGE_KEY };

// Re-export for direct access
export { onboardingHtml, terminalUiHtml, terminalUiStyles };

// Re-export type and default config
export { DEFAULT_SENTRY_CONFIG, DEFAULT_TERMINAL_UI_CONFIG };
export type { SentryConfig, TerminalUiConfig };

/**
 * Extract Sentry key from DSN for CDN loader URL
 *
 * DSN format: https://<key>@<org>.ingest.sentry.io/<project>
 * Returns the key portion (username from URL)
 */
function extractSentryKey(dsn: string): string {
  try {
    return new URL(dsn).username || '';
  } catch {
    return '';
  }
}

/**
 * Generate Sentry CDN script for client-side error monitoring
 */
function generateSentryScript(sentryConfig: SentryConfig): string {
  if (!sentryConfig.enabled || !sentryConfig.dsn) {
    return '';
  }

  const sentryKey = extractSentryKey(sentryConfig.dsn);
  if (!sentryKey) {
    return '';
  }

  return `
<script src="https://js.sentry-cdn.com/${sentryKey}.min.js" crossorigin="anonymous"></script>
<script>
Sentry.onLoad(function() {
  Sentry.init({
    environment: ${JSON.stringify(sentryConfig.environment)},
    sampleRate: ${sentryConfig.sample_rate}
  });
});
</script>`;
}

/** Options for terminal UI injection */
export interface InjectOptions {
  sentryConfig?: SentryConfig;
  previewAllowedExtensions?: string[];
}

/**
 * Inject terminal UI into HTML response
 *
 * Injects:
 * - Sentry CDN loader (if configured)
 * - CSS styles (inline for FOUC avoidance)
 * - HTML structure
 * - Onboarding tooltip (hidden by default)
 * - Config as global variable
 * - Script tag referencing external terminal-ui.js (static file)
 *
 * @param html - Original HTML content
 * @param basePath - Base path for the bunterm routes (e.g., "/bunterm")
 * @param config - Terminal UI configuration from config.yaml
 * @param options - Additional options (sentry, preview extensions)
 * @returns Modified HTML with terminal UI injected
 */
export function injectTerminalUi(
  html: string,
  basePath: string,
  config: TerminalUiConfig = DEFAULT_TERMINAL_UI_CONFIG,
  options: InjectOptions = {}
): string {
  const {
    sentryConfig = DEFAULT_SENTRY_CONFIG,
    previewAllowedExtensions = DEFAULT_PREVIEW_CONFIG.allowed_extensions
  } = options;

  // Prepare client-side Sentry config (subset of server config)
  const clientSentryConfig = sentryConfig.enabled
    ? {
        enabled: true,
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        sample_rate: sentryConfig.sample_rate
      }
    : undefined;

  // Merge basePath, sentry config, and preview extensions into config for client-side use
  const clientConfig = {
    ...config,
    base_path: basePath,
    preview_allowed_extensions: previewAllowedExtensions,
    sentry: clientSentryConfig
  };
  const configScript = `<script>window.__TERMINAL_UI_CONFIG__ = ${JSON.stringify(clientConfig)};</script>`;

  // Generate Sentry CDN script
  const sentryScript = generateSentryScript(sentryConfig);

  // Inject Sentry in <head> if configured
  let modifiedHtml = html;
  if (sentryScript) {
    modifiedHtml = html.replace('<head>', `<head>${sentryScript}`);
  }

  const bodyInjection = `
<style>${terminalUiStyles}</style>
${terminalUiHtml}
${onboardingHtml.replace('id="tui-onboarding"', 'id="tui-onboarding" style="display:none"')}
${configScript}
<script src="${basePath}/terminal-ui.js"></script>
`;
  return modifiedHtml.replace('</body>', `${bodyInjection}</body>`);
}
