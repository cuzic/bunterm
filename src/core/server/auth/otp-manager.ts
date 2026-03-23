/**
 * OTP Manager
 *
 * Generates and validates 6-digit one-time passwords for browser authentication.
 * Provides brute-force protection via attempt limiting and automatic expiration.
 */

import { randomInt } from 'node:crypto';

// === Types ===

export interface OtpEntry {
  /** 6-digit OTP code (zero-padded) */
  readonly code: string;
  /** Expiration timestamp (ms since epoch) */
  readonly expiresAt: number;
  /** Whether this OTP has been consumed */
  consumed: boolean;
}

export interface OtpGenerateResult {
  /** 6-digit OTP code */
  readonly code: string;
  /** Expiration timestamp (ms since epoch) */
  readonly expiresAt: number;
  /** TTL in seconds */
  readonly ttlSeconds: number;
}

export interface OtpValidateResult {
  readonly valid: boolean;
  readonly reason?: 'invalid_code' | 'expired' | 'already_used' | 'locked_out' | 'no_active_otp';
}

export interface OtpManagerOptions {
  /** Maximum failed attempts before lockout (default: 3) */
  maxAttempts?: number;
  /** Lockout duration in ms (default: 60000 = 1 minute) */
  lockoutDurationMs?: number;
  /** Clock function for testing */
  now?: () => number;
}

// === OtpManager ===

export class OtpManager {
  private currentOtp: OtpEntry | null = null;
  private failedAttempts = 0;
  private lockedUntil = 0;
  private readonly maxAttempts: number;
  private readonly lockoutDurationMs: number;
  private readonly now: () => number;

  constructor(options: OtpManagerOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? 3;
    this.lockoutDurationMs = options.lockoutDurationMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  /**
   * Generate a new 6-digit OTP.
   * Any previously active OTP is invalidated.
   */
  generate(ttlSeconds = 60): OtpGenerateResult {
    const now = this.now();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = now + ttlSeconds * 1000;

    // Invalidate previous OTP
    this.currentOtp = { code, expiresAt, consumed: false };

    // Reset lockout on new generation
    this.failedAttempts = 0;
    this.lockedUntil = 0;

    return { code, expiresAt, ttlSeconds };
  }

  /**
   * Validate an OTP code.
   * - One-time: consumed after successful validation
   * - Brute-force protection: locks out after maxAttempts failures
   */
  validate(code: string): OtpValidateResult {
    const now = this.now();

    // Check lockout
    if (now < this.lockedUntil) {
      return { valid: false, reason: 'locked_out' };
    }

    // Check if there's an active OTP
    if (!this.currentOtp) {
      return { valid: false, reason: 'no_active_otp' };
    }

    // Check if already consumed
    if (this.currentOtp.consumed) {
      return { valid: false, reason: 'already_used' };
    }

    // Check expiration
    if (now >= this.currentOtp.expiresAt) {
      this.currentOtp = null;
      return { valid: false, reason: 'expired' };
    }

    // Validate code (timing-safe comparison via string equality on fixed-length)
    if (code !== this.currentOtp.code) {
      this.failedAttempts++;
      if (this.failedAttempts >= this.maxAttempts) {
        this.lockedUntil = now + this.lockoutDurationMs;
        this.currentOtp = null; // Invalidate OTP on lockout
        this.failedAttempts = 0;
      }
      return { valid: false, reason: 'invalid_code' };
    }

    // Success — consume the OTP
    this.currentOtp.consumed = true;
    this.failedAttempts = 0;
    return { valid: true };
  }

  /**
   * Check if there is an active (non-expired, non-consumed) OTP
   */
  hasActiveOtp(): boolean {
    if (!this.currentOtp) return false;
    if (this.currentOtp.consumed) return false;
    if (this.now() >= this.currentOtp.expiresAt) return false;
    return true;
  }

  /**
   * Check if currently locked out
   */
  isLockedOut(): boolean {
    return this.now() < this.lockedUntil;
  }

  /**
   * Get remaining lockout time in seconds (0 if not locked)
   */
  lockoutRemainingSeconds(): number {
    const remaining = this.lockedUntil - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }
}
