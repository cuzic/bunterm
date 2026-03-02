/**
 * WebSocket Session Token
 *
 * Generates and validates short-lived tokens for WebSocket authentication.
 * Uses Sec-WebSocket-Protocol header for token transmission (RFC 6455 compliant).
 *
 * Token format: JWT-like structure with nonce protection against replay attacks.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// === Token Types ===

export interface TokenPayload {
  /** Session ID */
  sid: string;
  /** Issued at (Unix timestamp in seconds) */
  iat: number;
  /** Expiration (Unix timestamp in seconds) */
  exp: number;
  /** JWT ID (nonce for replay protection) */
  jti: string;
  /** User ID (optional, from external auth) */
  uid?: string;
}

export interface TokenValidation {
  valid: boolean;
  session?: TokenPayload;
  error?: string;
}

export interface TokenGeneratorOptions {
  /** HMAC secret key (should be at least 32 bytes) */
  secret: string;
  /** Token TTL in seconds (default: 30) */
  ttlSeconds?: number;
  /** Nonce store for replay protection */
  nonceStore: NonceStore;
}

// === Nonce Store Interface ===

export interface NonceStore {
  /**
   * Consume a nonce (mark as used)
   * @returns true if nonce was unused and is now consumed, false if already used
   */
  consume(jti: string, expiresAt: number): Promise<boolean>;

  /**
   * Cleanup expired nonces
   */
  cleanup(): Promise<void>;
}

// === InMemory NonceStore Implementation ===

export interface InMemoryNonceStoreOptions {
  /** Maximum number of nonces to store (default: 10000) */
  maxSize?: number;
  /** Cleanup interval in ms (default: 60000) */
  cleanupIntervalMs?: number;
}

export class InMemoryNonceStore implements NonceStore {
  private used = new Map<string, number>();
  private readonly maxSize: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: InMemoryNonceStoreOptions = {}) {
    this.maxSize = options.maxSize ?? 10000;

    // Start periodic cleanup
    const intervalMs = options.cleanupIntervalMs ?? 60000;
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  async consume(jti: string, expiresAt: number): Promise<boolean> {
    // Check if already used
    if (this.used.has(jti)) {
      return false;
    }

    // Check if we need to evict old entries
    if (this.used.size >= this.maxSize) {
      this.evictOldest();
    }

    // Mark as used
    this.used.set(jti, expiresAt);
    return true;
  }

  async cleanup(): Promise<void> {
    const now = Date.now() / 1000;
    for (const [jti, exp] of this.used) {
      if (exp < now) {
        this.used.delete(jti);
      }
    }
  }

  private evictOldest(): void {
    // Find and remove the entry with the earliest expiration
    let oldestJti: string | null = null;
    let oldestExp = Number.POSITIVE_INFINITY;

    for (const [jti, exp] of this.used) {
      if (exp < oldestExp) {
        oldestExp = exp;
        oldestJti = jti;
      }
    }

    if (oldestJti) {
      this.used.delete(oldestJti);
    }
  }

  /**
   * Get the number of stored nonces (for testing/monitoring)
   */
  get size(): number {
    return this.used.size;
  }

  /**
   * Dispose the nonce store and stop cleanup timer
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.used.clear();
  }
}

// === Token Generator ===

export class TokenGenerator {
  private readonly secret: Buffer;
  private readonly ttlSeconds: number;
  private readonly nonceStore: NonceStore;

  constructor(options: TokenGeneratorOptions) {
    this.secret = Buffer.from(options.secret, 'utf-8');
    this.ttlSeconds = options.ttlSeconds ?? 30;
    this.nonceStore = options.nonceStore;

    // Warn if secret is too short
    if (this.secret.length < 32) {
      console.warn('[TokenGenerator] Secret should be at least 32 bytes for security');
    }
  }

  /**
   * Generate a new token for a session
   */
  generate(sessionId: string, userId?: string): string {
    const now = Math.floor(Date.now() / 1000);
    const jti = randomBytes(16).toString('hex');

    const payload: TokenPayload = {
      sid: sessionId,
      iat: now,
      exp: now + this.ttlSeconds,
      jti,
      ...(userId && { uid: userId })
    };

    // Encode payload
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson).toString('base64url');

    // Create signature
    const signature = this.sign(payloadBase64);

    // Return token as "payload.signature"
    return `${payloadBase64}.${signature}`;
  }

  /**
   * Validate a token
   */
  async validate(token: string): Promise<TokenValidation> {
    // Split token
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, error: 'invalid_format' };
    }

    const payloadBase64 = parts[0] as string;
    const providedSignature = parts[1] as string;

    // Verify signature
    const expectedSignature = this.sign(payloadBase64);
    if (!this.timingSafeCompare(providedSignature, expectedSignature)) {
      return { valid: false, error: 'invalid_signature' };
    }

    // Decode payload
    let payload: TokenPayload;
    try {
      const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf-8');
      payload = JSON.parse(payloadJson);
    } catch {
      return { valid: false, error: 'invalid_payload' };
    }

    // Check required fields
    if (!payload.sid || !payload.iat || !payload.exp || !payload.jti) {
      return { valid: false, error: 'missing_fields' };
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: 'expired' };
    }

    // Check issued at (not too far in the future - clock skew tolerance of 30s)
    if (payload.iat > now + 30) {
      return { valid: false, error: 'invalid_iat' };
    }

    // Check nonce (replay protection)
    const nonceConsumed = await this.nonceStore.consume(payload.jti, payload.exp);
    if (!nonceConsumed) {
      return { valid: false, error: 'nonce_reused' };
    }

    return { valid: true, session: payload };
  }

  /**
   * Sign a payload using HMAC-SHA256
   */
  private sign(payload: string): string {
    const hmac = createHmac('sha256', this.secret);
    hmac.update(payload);
    return hmac.digest('base64url');
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }
}

// === Sec-WebSocket-Protocol Helpers ===

/**
 * Extract bearer token from Sec-WebSocket-Protocol header
 *
 * The client sends: Sec-WebSocket-Protocol: bearer.<token>
 * The server must echo the same protocol on successful upgrade.
 */
export function extractBearerToken(protocols: string | null): string | null {
  if (!protocols) {
    return null;
  }

  // Parse comma-separated protocols
  const protocolList = protocols.split(',').map((p) => p.trim());

  // Find bearer.<token> protocol
  const bearerProtocol = protocolList.find((p) => p.startsWith('bearer.'));

  if (!bearerProtocol) {
    return null;
  }

  // Extract token (everything after "bearer.")
  return bearerProtocol.slice(7);
}

/**
 * Create the Sec-WebSocket-Protocol header value for response
 */
export function createBearerProtocol(token: string): string {
  return `bearer.${token}`;
}

// === Singleton Management ===

let tokenGeneratorInstance: TokenGenerator | null = null;
let nonceStoreInstance: InMemoryNonceStore | null = null;

/**
 * Get or create the token generator instance
 */
export function getTokenGenerator(secret?: string): TokenGenerator {
  if (!tokenGeneratorInstance) {
    const envSecret = process.env['TTYD_MUX_WS_SECRET'];
    const secretKey = secret ?? envSecret ?? randomBytes(32).toString('hex');

    nonceStoreInstance = new InMemoryNonceStore();
    tokenGeneratorInstance = new TokenGenerator({
      secret: secretKey,
      nonceStore: nonceStoreInstance
    });
  }
  return tokenGeneratorInstance;
}

/**
 * Reset the token generator instance (for testing)
 */
export function resetTokenGenerator(): void {
  if (nonceStoreInstance) {
    nonceStoreInstance.dispose();
    nonceStoreInstance = null;
  }
  tokenGeneratorInstance = null;
}
