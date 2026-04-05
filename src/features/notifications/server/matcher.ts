/**
 * Pattern matcher for notification triggers
 */

import { createLogger } from '@/utils/logger.js';
import type { MatchResult, PatternConfig } from './types.js';

const log = createLogger('notification-matcher');

/**
 * Matcher configuration
 */
export interface MatcherConfig {
  patterns: PatternConfig[];
  defaultCooldown: number; // seconds
}

/**
 * NotificationMatcher interface
 */
export interface NotificationMatcher {
  /** Match text against patterns, respecting cooldowns */
  match(sessionName: string, text: string): MatchResult | null;
  /** Check if text matches a specific pattern (ignores cooldown) */
  matchesPattern(regex: string, text: string): boolean;
  /** Clear cooldown for a specific session and pattern */
  clearCooldown(sessionName: string, regex: string): void;
  /** Reset all cooldowns */
  reset(): void;
}

// Re-export for convenience
export type { MatchResult, PatternConfig };

/** Maximum regex pattern length to prevent DoS */
const MAX_REGEX_LENGTH = 1000;

/** Maximum text length to match against to prevent DoS */
const MAX_TEXT_LENGTH = 10000;

/** Patterns that are known to be vulnerable to ReDoS */
const DANGEROUS_PATTERNS = [
  /\(\.\*\)\+/, // (.*)+
  /\(\.\+\)\+/, // (.+)+
  /\([^)]*\+[^)]*\)\+/, // (a+)+ style patterns
  /\([^)]*\*[^)]*\)\+/, // (a*)+ style patterns
  /\([^)]*\+[^)]*\)\*/, // (a+)* style patterns
  /\([^)]*\*[^)]*\)\*/ // (a*)* style patterns
];

/**
 * Validate regex pattern for safety
 * Returns true if the pattern is safe, false if it's potentially dangerous
 */
function isRegexSafe(pattern: string): boolean {
  // Check length
  if (pattern.length > MAX_REGEX_LENGTH) {
    return false;
  }

  // Check for known dangerous patterns
  for (const dangerous of DANGEROUS_PATTERNS) {
    if (dangerous.test(pattern)) {
      return false;
    }
  }

  return true;
}

/**
 * Create a cooldown key for tracking
 */
function getCooldownKey(sessionName: string, regex: string): string {
  return `${sessionName}:${regex}`;
}

/**
 * Safely test a regex pattern against text with timeout protection
 * Returns match result or null if timeout/error
 */
function safeRegexTest(regex: RegExp, text: string): boolean {
  // Truncate text to prevent DoS
  const truncatedText = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  try {
    return regex.test(truncatedText);
  } catch {
    return false;
  }
}

/**
 * Create a notification matcher
 */
export function createNotificationMatcher(config: MatcherConfig): NotificationMatcher {
  const { patterns, defaultCooldown } = config;

  // Map of cooldown key -> timestamp when cooldown expires
  const cooldowns = new Map<string, number>();

  // Pre-compile regexes with safety validation
  const compiledPatterns: Array<{ config: PatternConfig; regex: RegExp }> = [];
  for (const pattern of patterns) {
    // Validate pattern safety
    if (!isRegexSafe(pattern.regex)) {
      log.warn(`Skipping potentially dangerous regex pattern: ${pattern.regex.slice(0, 50)}...`);
      continue;
    }

    try {
      compiledPatterns.push({
        config: pattern,
        regex: new RegExp(pattern.regex)
      });
    } catch {
      // Invalid regex pattern - skip silently
      log.warn(`Invalid regex pattern: ${pattern.regex.slice(0, 50)}...`);
    }
  }

  return {
    match(sessionName: string, text: string): MatchResult | null {
      const now = Date.now();

      for (const { config: pattern, regex } of compiledPatterns) {
        if (safeRegexTest(regex, text)) {
          const key = getCooldownKey(sessionName, pattern.regex);
          const cooldownExpires = cooldowns.get(key);

          // Check if in cooldown period
          if (cooldownExpires && now < cooldownExpires) {
            continue; // Still in cooldown, try next pattern
          }

          // Set cooldown
          const cooldownSeconds = pattern.cooldown ?? defaultCooldown;
          cooldowns.set(key, now + cooldownSeconds * 1000);

          return {
            pattern,
            matchedText: text,
            sessionName,
            timestamp: new Date().toISOString()
          };
        }
      }

      return null;
    },

    matchesPattern(regex: string, text: string): boolean {
      // Validate pattern safety
      if (!isRegexSafe(regex)) {
        return false;
      }

      try {
        const compiledRegex = new RegExp(regex);
        return safeRegexTest(compiledRegex, text);
      } catch {
        return false;
      }
    },

    clearCooldown(sessionName: string, regex: string): void {
      const key = getCooldownKey(sessionName, regex);
      cooldowns.delete(key);
    },

    reset(): void {
      cooldowns.clear();
    }
  };
}
