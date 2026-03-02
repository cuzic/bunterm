/**
 * OutputRedactor - Masks sensitive information from command output
 *
 * Built-in patterns cover common secret formats:
 * - AWS credentials (AKIA..., secret keys)
 * - JWT tokens
 * - GitHub tokens (ghp_, gho_, ghs_, ghr_)
 * - Google Cloud (AIza...)
 * - Slack tokens (xoxb-, xoxp-, xoxa-)
 * - Generic API keys
 * - Private keys (-----BEGIN)
 * - Basic Auth URLs (user:pass@)
 *
 * Custom patterns can be added via configuration.
 */

export interface RedactionPattern {
  name: string;
  pattern: RegExp;
  replacement?: string; // Default: '[REDACTED]'
}

export interface RedactionConfig {
  enabled: boolean;
  customPatterns?: Array<{
    name: string;
    pattern: string;
    replacement?: string;
  }>;
}

/** Default redaction configuration */
export const DEFAULT_REDACTION_CONFIG: RedactionConfig = {
  enabled: true,
  customPatterns: []
};

/**
 * Built-in redaction patterns for common secret formats
 */
export const BUILTIN_PATTERNS: RedactionPattern[] = [
  // AWS Access Key ID (starts with AKIA)
  {
    name: 'aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/g
  },
  // AWS Secret Access Key (40 character base64-ish string, usually after aws_secret_access_key=)
  {
    name: 'aws_secret_key',
    pattern: /aws_secret_access_key\s*[=:]\s*['"]?([A-Za-z0-9+/=]{40})['"]?/gi,
    replacement: 'aws_secret_access_key=[REDACTED]'
  },
  // JWT tokens (three base64 segments separated by dots)
  {
    name: 'jwt',
    pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
  },
  // GitHub tokens (personal access tokens, OAuth, etc.)
  {
    name: 'github_token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g
  },
  // Google API Key
  {
    name: 'google_api_key',
    pattern: /AIza[A-Za-z0-9_-]{35}/g
  },
  // Slack tokens
  {
    name: 'slack_token',
    pattern: /xox[bpas]-[A-Za-z0-9-]{10,}/g
  },
  // Private keys (PEM format)
  {
    name: 'private_key',
    pattern:
      /-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|ENCRYPTED\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+(RSA\s+|EC\s+|DSA\s+|ENCRYPTED\s+)?PRIVATE KEY-----/g,
    replacement: '-----BEGIN PRIVATE KEY-----\n[REDACTED]\n-----END PRIVATE KEY-----'
  },
  // Basic Auth in URLs (user:password@host)
  {
    name: 'basic_auth_url',
    pattern: /(https?:\/\/)([^:]+):([^@]+)@/gi,
    replacement: '$1$2:[REDACTED]@'
  },
  // npm tokens
  {
    name: 'npm_token',
    pattern: /npm_[A-Za-z0-9]{36}/g
  },
  // Stripe keys
  {
    name: 'stripe_key',
    pattern: /sk_live_[A-Za-z0-9]{24,}/g
  },
  {
    name: 'stripe_restricted_key',
    pattern: /rk_live_[A-Za-z0-9]{24,}/g
  },
  // Twilio Account SID and Auth Token
  {
    name: 'twilio_sid',
    pattern: /AC[a-f0-9]{32}/g
  },
  // Mailgun API key
  {
    name: 'mailgun_key',
    pattern: /key-[A-Za-z0-9]{32}/g
  },
  // SendGrid API key
  {
    name: 'sendgrid_key',
    pattern: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g
  },
  // Heroku API key
  {
    name: 'heroku_key',
    pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    // Note: UUIDs are common, so this may have false positives in some contexts
  },
  // Generic password patterns (key=value, password=value, etc.)
  {
    name: 'password_assignment',
    pattern:
      /(password|passwd|secret|token|api_key|apikey|auth|credential)[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,
    replacement: '$1=[REDACTED]'
  }
];

/**
 * Redaction statistics for a single operation
 */
export interface RedactionStats {
  totalRedactions: number;
  patternMatches: Record<string, number>;
}

/**
 * Output redactor with configurable patterns
 */
export class OutputRedactor {
  private readonly patterns: RedactionPattern[];
  private readonly enabled: boolean;

  constructor(config: RedactionConfig = DEFAULT_REDACTION_CONFIG) {
    this.enabled = config.enabled;
    this.patterns = [...BUILTIN_PATTERNS];

    // Add custom patterns
    if (config.customPatterns) {
      for (const custom of config.customPatterns) {
        try {
          this.patterns.push({
            name: custom.name,
            pattern: new RegExp(custom.pattern, 'g'),
            replacement: custom.replacement
          });
        } catch (error) {
          console.error(`Invalid custom redaction pattern "${custom.name}":`, error);
        }
      }
    }
  }

  /**
   * Redact sensitive information from text
   */
  redact(text: string): string {
    if (!this.enabled) {
      return text;
    }

    let result = text;

    for (const pattern of this.patterns) {
      // Reset lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      const replacement = pattern.replacement ?? '[REDACTED]';
      result = result.replace(pattern.pattern, replacement);
    }

    return result;
  }

  /**
   * Redact sensitive information and return statistics
   */
  redactWithStats(text: string): { result: string; stats: RedactionStats } {
    if (!this.enabled) {
      return {
        result: text,
        stats: { totalRedactions: 0, patternMatches: {} }
      };
    }

    let result = text;
    const patternMatches: Record<string, number> = {};
    let totalRedactions = 0;

    for (const pattern of this.patterns) {
      // Reset lastIndex for global patterns
      pattern.pattern.lastIndex = 0;

      // Count matches
      const matches = result.match(pattern.pattern);
      if (matches) {
        patternMatches[pattern.name] = matches.length;
        totalRedactions += matches.length;
      }

      // Apply redaction
      const replacement = pattern.replacement ?? '[REDACTED]';
      result = result.replace(pattern.pattern, replacement);
    }

    return {
      result,
      stats: { totalRedactions, patternMatches }
    };
  }

  /**
   * Check if text contains any sensitive patterns (without redacting)
   */
  containsSensitive(text: string): boolean {
    if (!this.enabled) {
      return false;
    }

    for (const pattern of this.patterns) {
      pattern.pattern.lastIndex = 0;
      if (pattern.pattern.test(text)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all pattern names
   */
  getPatternNames(): string[] {
    return this.patterns.map((p) => p.name);
  }

  /**
   * Check if redaction is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Create a redactor with default configuration
 */
export function createRedactor(config?: RedactionConfig): OutputRedactor {
  return new OutputRedactor(config);
}

/**
 * Convenience function to redact text with default settings
 */
export function redactSensitive(text: string): string {
  const redactor = new OutputRedactor();
  return redactor.redact(text);
}
