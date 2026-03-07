/**
 * WebSocket Authentication and QoS Module
 *
 * Provides:
 * - Origin validation for CSWSH protection
 * - Session token generation and validation
 * - QoS management for terminal and AI streams
 */

export {
  validateOrigin,
  createSecurityConfig,
  DEFAULT_SECURITY_CONFIG,
  type SecurityConfig,
  type ValidationResult
} from './origin-validator.js';

export {
  TokenGenerator,
  InMemoryNonceStore,
  extractBearerToken,
  createBearerProtocol,
  getTokenGenerator,
  resetTokenGenerator,
  type TokenPayload,
  type TokenValidation,
  type TokenGeneratorOptions,
  type NonceStore,
  type InMemoryNonceStoreOptions
} from './session-token.js';

export {
  AdaptiveQoS,
  TerminalOutputThrottler,
  AIStreamThrottler,
  getAdaptiveQoS,
  resetAdaptiveQoS,
  type DynamicQoS,
  type AdaptiveQoSOptions,
  type TerminalOutputThrottlerOptions,
  type AIStreamThrottlerOptions
} from './qos.js';
