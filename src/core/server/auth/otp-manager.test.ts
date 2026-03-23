/**
 * OTP Manager Tests
 */

import { describe, expect, it } from 'bun:test';
import { OtpManager } from './otp-manager.js';

describe('OtpManager', () => {
  function createManager(options?: { now?: () => number }) {
    let time = 1000000;
    const now = options?.now ?? (() => time);
    const manager = new OtpManager({ maxAttempts: 3, lockoutDurationMs: 60_000, now });
    return {
      manager,
      advanceTime: (ms: number) => {
        time += ms;
      },
      setTime: (t: number) => {
        time = t;
      }
    };
  }

  describe('generate', () => {
    it('generates a 6-digit zero-padded code', () => {
      const { manager } = createManager();
      const result = manager.generate(60);

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.ttlSeconds).toBe(60);
      expect(result.expiresAt).toBe(1000000 + 60_000);
    });

    it('invalidates previous OTP when generating new one', () => {
      const { manager } = createManager();
      const first = manager.generate(60);
      const second = manager.generate(60);

      // First code should no longer work
      const result = manager.validate(first.code);
      expect(result.valid).toBe(false);

      // Second code should work
      const result2 = manager.validate(second.code);
      expect(result2.valid).toBe(true);
    });

    it('resets lockout on new generation', () => {
      const { manager } = createManager();
      const _otp = manager.generate(60);

      // Fail 3 times to trigger lockout
      manager.validate('000000');
      manager.validate('000000');
      manager.validate('000000');
      expect(manager.isLockedOut()).toBe(true);

      // Generate new OTP resets lockout
      manager.generate(60);
      expect(manager.isLockedOut()).toBe(false);
    });
  });

  describe('validate', () => {
    it('returns valid for correct code', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);

      const result = manager.validate(otp.code);
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns invalid_code for wrong code', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);
      const wrongCode = otp.code === '000000' ? '111111' : '000000';

      const result = manager.validate(wrongCode);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_code');
    });

    it('returns already_used after successful validation', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);

      manager.validate(otp.code);
      const result = manager.validate(otp.code);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('already_used');
    });

    it('returns expired when OTP has expired', () => {
      const { manager, advanceTime } = createManager();
      const otp = manager.generate(60);

      advanceTime(61_000); // Advance past expiration

      const result = manager.validate(otp.code);
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('returns no_active_otp when no OTP generated', () => {
      const { manager } = createManager();

      const result = manager.validate('123456');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('no_active_otp');
    });

    it('locks out after max failed attempts', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);
      const wrongCode = otp.code === '000000' ? '111111' : '000000';

      manager.validate(wrongCode);
      manager.validate(wrongCode);
      const result = manager.validate(wrongCode);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_code');
      expect(manager.isLockedOut()).toBe(true);
    });

    it('returns locked_out during lockout period', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);
      const wrongCode = otp.code === '000000' ? '111111' : '000000';

      manager.validate(wrongCode);
      manager.validate(wrongCode);
      manager.validate(wrongCode);

      // Generate new OTP (after lockout) — but we're still locked from previous
      // Actually lockout invalidates the OTP, so generate again
      const otp2 = manager.generate(60);
      // generate resets lockout
      expect(manager.isLockedOut()).toBe(false);

      // Trigger lockout again
      const wrongCode2 = otp2.code === '000000' ? '111111' : '000000';
      manager.validate(wrongCode2);
      manager.validate(wrongCode2);
      manager.validate(wrongCode2);

      const result = manager.validate('123456');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('locked_out');
    });

    it('unlocks after lockout duration', () => {
      const { manager, advanceTime } = createManager();
      const otp = manager.generate(120); // Long TTL
      const wrongCode = otp.code === '000000' ? '111111' : '000000';

      manager.validate(wrongCode);
      manager.validate(wrongCode);
      manager.validate(wrongCode);

      expect(manager.isLockedOut()).toBe(true);

      advanceTime(61_000); // Past lockout

      expect(manager.isLockedOut()).toBe(false);
    });
  });

  describe('hasActiveOtp', () => {
    it('returns false when no OTP generated', () => {
      const { manager } = createManager();
      expect(manager.hasActiveOtp()).toBe(false);
    });

    it('returns true when OTP is active', () => {
      const { manager } = createManager();
      manager.generate(60);
      expect(manager.hasActiveOtp()).toBe(true);
    });

    it('returns false after OTP is consumed', () => {
      const { manager } = createManager();
      const otp = manager.generate(60);
      manager.validate(otp.code);
      expect(manager.hasActiveOtp()).toBe(false);
    });

    it('returns false after OTP expires', () => {
      const { manager, advanceTime } = createManager();
      manager.generate(60);
      advanceTime(61_000);
      expect(manager.hasActiveOtp()).toBe(false);
    });
  });

  describe('lockoutRemainingSeconds', () => {
    it('returns 0 when not locked out', () => {
      const { manager } = createManager();
      expect(manager.lockoutRemainingSeconds()).toBe(0);
    });

    it('returns remaining seconds during lockout', () => {
      const { manager, advanceTime } = createManager();
      manager.generate(60);
      const otp = manager.generate(60);
      const wrongCode = otp.code === '000000' ? '111111' : '000000';

      manager.validate(wrongCode);
      manager.validate(wrongCode);
      manager.validate(wrongCode);

      expect(manager.lockoutRemainingSeconds()).toBe(60);

      advanceTime(30_000);
      expect(manager.lockoutRemainingSeconds()).toBe(30);
    });
  });
});
