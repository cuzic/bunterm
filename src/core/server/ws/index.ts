/**
 * WebSocket Authentication and QoS Module
 *
 * Provides:
 * - Origin validation for CSWSH protection
 * - Session token generation and validation
 * - QoS management for terminal and AI streams
 */

export {
  createSecurityConfig,
  getWebSocketErrorHint,
  type SecurityConfig,
  type ValidationResult,
  validateOrigin
} from './origin-validator.js';
export {
  createBearerProtocol,
  extractBearerToken,
  getTokenGenerator,
  InMemoryNonceStore,
  type InMemoryNonceStoreOptions,
  type NonceStore,
  resetTokenGenerator,
  TokenGenerator,
  type TokenGeneratorOptions,
  type TokenPayload,
  type TokenValidation
} from './session-token.js';
