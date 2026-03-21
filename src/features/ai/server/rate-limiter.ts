/**
 * Rate Limiter
 *
 * Implements sliding window rate limiting for AI requests.
 */

export interface RateLimitOptions {
  /** Maximum requests per window */
  maxRequests?: number;
  /** Window duration in milliseconds */
  windowMs?: number;
  /** Enable rate limiting (default: true) */
  enabled?: boolean;
}

const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  enabled: true
};

interface RateLimitEntry {
  timestamps: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs?: number;
}

/**
 * Sliding window rate limiter
 */
export class RateLimiter implements Disposable {
  private entries: Map<string, RateLimitEntry> = new Map();
  private options: Required<RateLimitOptions>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: RateLimitOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Periodically cleanup old entries
    this.cleanupInterval = setInterval(() => this.cleanup(), this.options.windowMs);
  }

  /**
   * Check if a request is allowed and record it
   */
  check(key: string): RateLimitResult {
    if (!this.options.enabled) {
      return {
        allowed: true,
        remaining: this.options.maxRequests,
        resetAt: Date.now() + this.options.windowMs
      };
    }

    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Get or create entry
    let entry = this.entries.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.entries.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    // Check if allowed
    const requestCount = entry.timestamps.length;
    const remaining = Math.max(0, this.options.maxRequests - requestCount);
    const allowed = requestCount < this.options.maxRequests;

    // Calculate reset time (when the oldest request in window expires)
    let resetAt = now + this.options.windowMs;
    if (entry.timestamps.length > 0) {
      const oldestTimestamp = entry.timestamps[0];
      if (oldestTimestamp !== undefined) {
        resetAt = oldestTimestamp + this.options.windowMs;
      }
    }

    // Record this request if allowed
    if (allowed) {
      entry.timestamps.push(now);
    }

    // Calculate retry after if not allowed
    let retryAfterMs: number | undefined;
    if (!allowed && entry.timestamps[0] !== undefined) {
      retryAfterMs = entry.timestamps[0] + this.options.windowMs - now;
    }

    return {
      allowed,
      remaining: allowed ? remaining - 1 : remaining,
      resetAt,
      retryAfterMs
    };
  }

  /**
   * Check without recording (peek)
   */
  peek(key: string): RateLimitResult {
    if (!this.options.enabled) {
      return {
        allowed: true,
        remaining: this.options.maxRequests,
        resetAt: Date.now() + this.options.windowMs
      };
    }

    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    const entry = this.entries.get(key);
    if (!entry) {
      return {
        allowed: true,
        remaining: this.options.maxRequests,
        resetAt: now + this.options.windowMs
      };
    }

    // Count recent requests
    const recentTimestamps = entry.timestamps.filter((t) => t > windowStart);
    const requestCount = recentTimestamps.length;
    const remaining = Math.max(0, this.options.maxRequests - requestCount);
    const allowed = requestCount < this.options.maxRequests;

    // Calculate reset time
    let resetAt = now + this.options.windowMs;
    if (recentTimestamps.length > 0) {
      const oldestTimestamp = recentTimestamps[0];
      if (oldestTimestamp !== undefined) {
        resetAt = oldestTimestamp + this.options.windowMs;
      }
    }

    return {
      allowed,
      remaining,
      resetAt
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Reset all rate limits
   */
  resetAll(): void {
    this.entries.clear();
  }

  /**
   * Get rate limit info for a key
   */
  getInfo(key: string): {
    requestCount: number;
    remaining: number;
    resetAt: number;
  } {
    const result = this.peek(key);
    return {
      requestCount: this.options.maxRequests - result.remaining,
      remaining: result.remaining,
      resetAt: result.resetAt
    };
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    for (const [key, entry] of this.entries.entries()) {
      // Remove old timestamps
      entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

      // Remove empty entries
      if (entry.timestamps.length === 0) {
        this.entries.delete(key);
      }
    }
  }

  /**
   * Enable or disable rate limiting
   */
  setEnabled(enabled: boolean): void {
    this.options.enabled = enabled;
    if (!enabled) {
      this.resetAll();
    }
  }

  /**
   * Update rate limit options
   */
  updateOptions(options: Partial<RateLimitOptions>): void {
    if (options.maxRequests !== undefined) {
      this.options.maxRequests = options.maxRequests;
    }
    if (options.windowMs !== undefined) {
      this.options.windowMs = options.windowMs;
    }
    if (options.enabled !== undefined) {
      this.setEnabled(options.enabled);
    }
  }

  /**
   * Dispose the rate limiter
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.entries.clear();
  }

  /**
   * Dispose the rate limiter.
   * Implements Symbol.dispose for use with `using` declarations.
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeKeys: number;
    totalRequests: number;
    options: Required<RateLimitOptions>;
  } {
    let totalRequests = 0;
    for (const entry of this.entries.values()) {
      totalRequests += entry.timestamps.length;
    }

    return {
      activeKeys: this.entries.size,
      totalRequests,
      options: { ...this.options }
    };
  }
}
