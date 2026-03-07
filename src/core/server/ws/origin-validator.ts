/**
 * Origin Validator
 *
 * Validates WebSocket connection origins for CSWSH (Cross-Site WebSocket Hijacking) protection.
 * Part of the security model where external proxies handle authentication,
 * and bunterm handles origin verification + session tokens.
 */

export interface SecurityConfig {
  /** Development mode - allows localhost without Origin header */
  devMode: boolean;
  /** List of allowed origin URLs */
  allowedOrigins: string[];
}

export interface ValidationResult {
  /** Whether the origin is allowed */
  allowed: boolean;
  /** Reason for the decision */
  reason: 'allowlist_match' | 'dev_mode_localhost' | 'missing_origin' | 'origin_not_allowed';
}

/** Default security configuration */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  devMode: false,
  allowedOrigins: []
};

/**
 * Check if a host is localhost
 */
function isLocalhostHost(host: string): boolean {
  const normalized = host.toLowerCase();
  // Handle IPv6 addresses (may be wrapped in brackets)
  const unwrapped = normalized.replace(/^\[|\]$/g, '');
  return unwrapped === 'localhost' || unwrapped === '127.0.0.1' || unwrapped === '::1';
}

/**
 * Check if a request is from localhost
 */
function isLocalhost(req: Request): boolean {
  const url = new URL(req.url);
  return isLocalhostHost(url.hostname);
}

/**
 * Normalize an origin URL for comparison
 */
function normalizeOrigin(origin: string): string {
  try {
    const url = new URL(origin);
    // Normalize to lowercase and remove trailing slashes
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return origin.toLowerCase();
  }
}

/**
 * Validate the Origin header of a WebSocket request
 *
 * Security model:
 * - Origin header is required for WebSocket connections (browser enforced)
 * - Exception: dev_mode + localhost allows missing Origin for testing
 * - Origin must match one of the configured allowed origins
 *
 * @param req - The incoming HTTP request
 * @param config - Security configuration
 * @returns Validation result with allowed status and reason
 */
export function validateOrigin(req: Request, config: SecurityConfig): ValidationResult {
  const origin = req.headers.get('Origin');

  // Check for missing Origin header
  if (!origin) {
    // Dev mode exception: allow localhost without Origin
    if (config.devMode && isLocalhost(req)) {
      return { allowed: true, reason: 'dev_mode_localhost' };
    }
    return { allowed: false, reason: 'missing_origin' };
  }

  const normalizedOrigin = normalizeOrigin(origin);

  // Check against allowlist
  const allowedNormalized = config.allowedOrigins.map(normalizeOrigin);
  if (allowedNormalized.includes(normalizedOrigin)) {
    return { allowed: true, reason: 'allowlist_match' };
  }

  // Dev mode: also allow localhost origins
  if (config.devMode) {
    try {
      const originUrl = new URL(origin);
      if (isLocalhostHost(originUrl.hostname)) {
        return { allowed: true, reason: 'dev_mode_localhost' };
      }
    } catch {
      // Invalid origin URL
    }
  }

  return { allowed: false, reason: 'origin_not_allowed' };
}

/**
 * Create a security configuration from environment/config
 */
export function createSecurityConfig(options?: {
  devMode?: boolean;
  allowedOrigins?: string[];
}): SecurityConfig {
  return {
    devMode: options?.devMode ?? process.env.NODE_ENV === 'development',
    allowedOrigins: options?.allowedOrigins ?? []
  };
}
