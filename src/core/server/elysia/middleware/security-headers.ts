/**
 * Elysia Security Headers Plugin
 *
 * Applies security headers to all responses.
 * Equivalent to the securityHeaders() function in http/utils.ts.
 */

import { Elysia } from 'elysia';

function buildCsp(sentryEnabled: boolean): string {
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  return `default-src 'self'; script-src 'self'${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:${sentryConnectSrc}; frame-src 'self'`;
}

export const securityHeadersPlugin = new Elysia({ name: 'security-headers' })
  .state('sentryEnabled', false)
  .onAfterHandle(({ set, store }) => {
    const sentryEnabled = store.sentryEnabled;

    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'SAMEORIGIN';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    set.headers['Content-Security-Policy'] = buildCsp(sentryEnabled);
    set.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(), payment=()';
    set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  })
  .as('global');
