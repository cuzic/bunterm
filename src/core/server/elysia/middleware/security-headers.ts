/**
 * Elysia Security Headers Plugin
 *
 * Applies security headers to all responses.
 * Supports nonce-based CSP to eliminate 'unsafe-inline' from script-src.
 * When store.cspNonce is set per-request, the nonce replaces 'unsafe-inline'.
 */

import { Elysia } from 'elysia';

export function buildCsp(sentryEnabled: boolean, nonce?: string): string {
  const sentryScriptSrc = sentryEnabled ? ' https://js.sentry-cdn.com' : '';
  const sentryConnectSrc = sentryEnabled ? ' https://*.ingest.sentry.io' : '';

  const scriptInline = nonce ? `'nonce-${nonce}'` : "'unsafe-inline'";

  return `default-src 'self'; script-src 'self' ${scriptInline}${sentryScriptSrc}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:${sentryConnectSrc}; frame-src 'self'`;
}

export const securityHeadersPlugin = new Elysia({ name: 'security-headers' })
  .state('sentryEnabled', false)
  .state('cspNonce', '')
  .onAfterHandle(({ set, store }) => {
    const sentryEnabled = store.sentryEnabled;
    const nonce = store.cspNonce || undefined;

    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'SAMEORIGIN';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    set.headers['Content-Security-Policy'] = buildCsp(sentryEnabled, nonce);
    set.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=(), payment=()';
    set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  })
  .as('global');
