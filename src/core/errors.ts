/**
 * Domain Error Types
 *
 * Standardized error types for expected errors that are part of business logic.
 * All domain errors have a `code` field for programmatic handling.
 *
 * Use these with Result<T, DomainError> return types.
 */

// === Base Error Interface ===

/**
 * Base interface for all domain errors
 */
export interface DomainError {
  readonly code: string;
  readonly message: string;
}

// === Session Errors ===

export interface SessionNotFoundError {
  readonly code: 'SESSION_NOT_FOUND';
  readonly message: string;
  readonly sessionName: string;
}

export interface SessionAlreadyExistsError {
  readonly code: 'SESSION_ALREADY_EXISTS';
  readonly message: string;
  readonly sessionName: string;
}

export interface SessionInvalidNameError {
  readonly code: 'SESSION_INVALID_NAME';
  readonly message: string;
  readonly name: string;
  readonly reason: string;
}

export type SessionError =
  | SessionNotFoundError
  | SessionAlreadyExistsError
  | SessionInvalidNameError;

// === Daemon Errors ===

export interface DaemonNotRunningError {
  readonly code: 'DAEMON_NOT_RUNNING';
  readonly message: string;
}

export interface DaemonAlreadyRunningError {
  readonly code: 'DAEMON_ALREADY_RUNNING';
  readonly message: string;
}

export interface DaemonStartFailedError {
  readonly code: 'DAEMON_START_FAILED';
  readonly message: string;
  readonly reason: string;
}

export interface DaemonUnavailableError {
  readonly code: 'DAEMON_UNAVAILABLE';
  readonly message: string;
  readonly reason: string;
}

export type DaemonError =
  | DaemonNotRunningError
  | DaemonAlreadyRunningError
  | DaemonStartFailedError
  | DaemonUnavailableError;

// === Config Errors ===

export interface ConfigNotFoundError {
  readonly code: 'CONFIG_NOT_FOUND';
  readonly message: string;
  readonly path: string;
}

export interface ConfigInvalidYamlError {
  readonly code: 'CONFIG_INVALID_YAML';
  readonly message: string;
  readonly path: string;
  readonly parseError: string;
}

export interface ConfigValidationError {
  readonly code: 'CONFIG_VALIDATION_FAILED';
  readonly message: string;
  readonly field: string;
  readonly reason: string;
}

export type ConfigError = ConfigNotFoundError | ConfigInvalidYamlError | ConfigValidationError;

// === File Errors ===

export interface FileNotFoundError {
  readonly code: 'FILE_NOT_FOUND';
  readonly message: string;
  readonly path: string;
}

export interface PathTraversalError {
  readonly code: 'PATH_TRAVERSAL';
  readonly message: string;
  readonly path: string;
}

export interface FileReadError {
  readonly code: 'FILE_READ_ERROR';
  readonly message: string;
  readonly path: string;
  readonly reason: string;
}

export type FileError = FileNotFoundError | PathTraversalError | FileReadError;

// === External Tool Errors ===

export interface TmuxNotInstalledError {
  readonly code: 'TMUX_NOT_INSTALLED';
  readonly message: string;
}

export interface TmuxSessionNotFoundError {
  readonly code: 'TMUX_SESSION_NOT_FOUND';
  readonly message: string;
  readonly sessionName: string;
}

export type TmuxError = TmuxNotInstalledError | TmuxSessionNotFoundError;

// === Block Errors ===

export interface BlockNotFoundError {
  readonly code: 'BLOCK_NOT_FOUND';
  readonly message: string;
  readonly blockId: string;
}

export interface BlockAlreadyRunningError {
  readonly code: 'BLOCK_ALREADY_RUNNING';
  readonly message: string;
  readonly blockId: string;
}

export type BlockError = BlockNotFoundError | BlockAlreadyRunningError;

// === Parse Errors (Boundary Validation) ===

/**
 * Source of the parse error
 */
export type ParseErrorSource = 'query' | 'body' | 'path' | 'json' | 'env' | 'file' | 'ws' | 'cli';

/**
 * Parse error codes
 */
export type ParseErrorCode =
  | 'MISSING_FIELD'
  | 'INVALID_TYPE'
  | 'INVALID_FORMAT'
  | 'OUT_OF_RANGE'
  | 'INVALID_ENUM'
  | 'TOO_LONG'
  | 'TOO_SHORT'
  | 'PARSE_FAILED';

/**
 * Parse error for boundary input validation.
 * Used when external input fails schema validation.
 */
export interface ParseError {
  readonly type: 'parse';
  readonly code: ParseErrorCode;
  readonly source: ParseErrorSource;
  readonly field: string;
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
}

/**
 * Create a parse error
 */
export function parseError(
  code: ParseErrorCode,
  source: ParseErrorSource,
  field: string,
  message: string,
  details?: { expected?: string; received?: string }
): ParseError {
  return {
    type: 'parse',
    code,
    source,
    field,
    message,
    ...details
  };
}

/**
 * Shorthand constructors for common parse errors
 */
const _missingField = (source: ParseErrorSource, field: string): ParseError =>
  parseError('MISSING_FIELD', source, field, `Missing required field: ${field}`);

const _invalidType = (
  source: ParseErrorSource,
  field: string,
  expected: string,
  received: string
): ParseError =>
  parseError(
    'INVALID_TYPE',
    source,
    field,
    `Invalid type for ${field}: expected ${expected}, got ${received}`,
    {
      expected,
      received
    }
  );

const _invalidFormat = (source: ParseErrorSource, field: string, format: string): ParseError =>
  parseError('INVALID_FORMAT', source, field, `Invalid format for ${field}: expected ${format}`);

const _outOfRange = (
  source: ParseErrorSource,
  field: string,
  min?: number,
  max?: number
): ParseError => {
  const range =
    min !== undefined && max !== undefined
      ? `${min}-${max}`
      : min !== undefined
        ? `>= ${min}`
        : `<= ${max}`;
  return parseError('OUT_OF_RANGE', source, field, `${field} out of range: expected ${range}`);
};

const _invalidEnum = (source: ParseErrorSource, field: string, allowed: string[]): ParseError =>
  parseError(
    'INVALID_ENUM',
    source,
    field,
    `Invalid value for ${field}: must be one of ${allowed.join(', ')}`
  );

const _parseFailed = (source: ParseErrorSource, message: string): ParseError =>
  parseError('PARSE_FAILED', source, '_root', message);

// === Validation Errors ===

export interface ValidationError {
  readonly code: 'VALIDATION_FAILED';
  readonly message: string;
  readonly field: string;
  readonly reason: string;
}

export interface UnauthorizedError {
  readonly code: 'UNAUTHORIZED';
  readonly message: string;
}

export interface MethodNotAllowedError {
  readonly code: 'METHOD_NOT_ALLOWED';
  readonly message: string;
  readonly method: string;
  readonly allowed: string[];
}

export interface NotFoundError {
  readonly code: 'NOT_FOUND';
  readonly message: string;
  readonly path: string;
}

export type HttpError = ValidationError | UnauthorizedError | MethodNotAllowedError | NotFoundError;

// === Union of All Domain Errors ===

export type AnyDomainError =
  | SessionError
  | DaemonError
  | ConfigError
  | FileError
  | TmuxError
  | BlockError
  | HttpError;

// === Error Constructors ===

export const sessionNotFound = (sessionName: string): SessionNotFoundError => ({
  code: 'SESSION_NOT_FOUND',
  message: `Session '${sessionName}' not found`,
  sessionName
});

const _sessionAlreadyExists = (sessionName: string): SessionAlreadyExistsError => ({
  code: 'SESSION_ALREADY_EXISTS',
  message: `Session '${sessionName}' already exists`,
  sessionName
});

export const sessionInvalidName = (name: string, reason: string): SessionInvalidNameError => ({
  code: 'SESSION_INVALID_NAME',
  message: `Invalid session name '${name}': ${reason}`,
  name,
  reason
});

export const daemonNotRunning = (): DaemonNotRunningError => ({
  code: 'DAEMON_NOT_RUNNING',
  message: 'Daemon is not running'
});

const _daemonAlreadyRunning = (): DaemonAlreadyRunningError => ({
  code: 'DAEMON_ALREADY_RUNNING',
  message: 'Daemon is already running'
});

const _daemonStartFailed = (reason: string): DaemonStartFailedError => ({
  code: 'DAEMON_START_FAILED',
  message: `Failed to start daemon: ${reason}`,
  reason
});

const _daemonUnavailable = (reason: string): DaemonUnavailableError => ({
  code: 'DAEMON_UNAVAILABLE',
  message: `Daemon unavailable: ${reason}`,
  reason
});

export const configNotFound = (path: string): ConfigNotFoundError => ({
  code: 'CONFIG_NOT_FOUND',
  message: `Config file not found: ${path}`,
  path
});

const _configInvalidYaml = (path: string, parseError: string): ConfigInvalidYamlError => ({
  code: 'CONFIG_INVALID_YAML',
  message: `Invalid YAML in ${path}: ${parseError}`,
  path,
  parseError
});

const _configValidationFailed = (field: string, reason: string): ConfigValidationError => ({
  code: 'CONFIG_VALIDATION_FAILED',
  message: `Config validation failed for ${field}: ${reason}`,
  field,
  reason
});

const _fileNotFound = (path: string): FileNotFoundError => ({
  code: 'FILE_NOT_FOUND',
  message: `File not found: ${path}`,
  path
});

export const pathTraversal = (path: string): PathTraversalError => ({
  code: 'PATH_TRAVERSAL',
  message: `Path traversal attempt: ${path}`,
  path
});

const _fileReadError = (path: string, reason: string): FileReadError => ({
  code: 'FILE_READ_ERROR',
  message: `Failed to read file ${path}: ${reason}`,
  path,
  reason
});

export const tmuxNotInstalled = (): TmuxNotInstalledError => ({
  code: 'TMUX_NOT_INSTALLED',
  message: 'tmux is not installed'
});

const _tmuxSessionNotFound = (sessionName: string): TmuxSessionNotFoundError => ({
  code: 'TMUX_SESSION_NOT_FOUND',
  message: `tmux session '${sessionName}' not found`,
  sessionName
});

const _blockNotFound = (blockId: string): BlockNotFoundError => ({
  code: 'BLOCK_NOT_FOUND',
  message: `Block '${blockId}' not found`,
  blockId
});

const _blockAlreadyRunning = (blockId: string): BlockAlreadyRunningError => ({
  code: 'BLOCK_ALREADY_RUNNING',
  message: `Block '${blockId}' is already running`,
  blockId
});

const _validationFailed = (field: string, reason: string): ValidationError => ({
  code: 'VALIDATION_FAILED',
  message: `Validation failed for '${field}': ${reason}`,
  field,
  reason
});

const _unauthorized = (message = 'Unauthorized'): UnauthorizedError => ({
  code: 'UNAUTHORIZED',
  message
});

const _methodNotAllowed = (method: string, allowed: string[]): MethodNotAllowedError => ({
  code: 'METHOD_NOT_ALLOWED',
  message: `Method ${method} not allowed. Allowed: ${allowed.join(', ')}`,
  method,
  allowed
});

const _notFound = (path: string): NotFoundError => ({
  code: 'NOT_FOUND',
  message: `Not found: ${path}`,
  path
});

// === Error Code Type Guard ===

/**
 * Check if an error has a specific code
 */
function _hasErrorCode<T extends DomainError>(error: DomainError, code: T['code']): error is T {
  return error.code === code;
}

// === CLI Exit Code Mapping ===

/**
 * Map domain error codes to CLI exit codes.
 *
 * Exit code conventions:
 *   1 - General error
 *   2 - Misuse (invalid arguments, bad input)
 *   3 - External dependency unavailable
 *   4 - Resource not found
 *   5 - Permission/access denied
 */
export function toCliExitCode(error: AnyDomainError): number {
  switch (error.code) {
    // Not found → 4
    case 'SESSION_NOT_FOUND':
    case 'FILE_NOT_FOUND':
    case 'TMUX_SESSION_NOT_FOUND':
    case 'CONFIG_NOT_FOUND':
    case 'BLOCK_NOT_FOUND':
    case 'NOT_FOUND':
      return 4;

    // Bad input → 2
    case 'SESSION_INVALID_NAME':
    case 'CONFIG_INVALID_YAML':
    case 'CONFIG_VALIDATION_FAILED':
    case 'VALIDATION_FAILED':
    case 'METHOD_NOT_ALLOWED':
      return 2;

    // Permission denied → 5
    case 'PATH_TRAVERSAL':
    case 'UNAUTHORIZED':
      return 5;

    // External dependency unavailable → 3
    case 'DAEMON_NOT_RUNNING':
    case 'DAEMON_UNAVAILABLE':
    case 'DAEMON_START_FAILED':
    case 'TMUX_NOT_INSTALLED':
      return 3;

    // Already exists (conflict) → 1
    case 'SESSION_ALREADY_EXISTS':
    case 'DAEMON_ALREADY_RUNNING':
    case 'BLOCK_ALREADY_RUNNING':
      return 1;

    // I/O error → 1
    case 'FILE_READ_ERROR':
      return 1;

    default:
      return 1;
  }
}

// === CLI Error Rendering ===

export interface RenderedCliError {
  readonly message: string;
  readonly hint?: string;
}

/**
 * Render a domain error for CLI output.
 * Returns error message with optional hint for recovery.
 */
export function renderCliError(error: AnyDomainError): RenderedCliError {
  switch (error.code) {
    case 'DAEMON_NOT_RUNNING':
      return {
        message: error.message,
        hint: 'Run "bunterm up" to start a session.'
      };

    case 'DAEMON_START_FAILED':
      return {
        message: error.message,
        hint: 'Run "bunterm doctor" to check for issues.'
      };

    case 'SESSION_NOT_FOUND':
      return {
        message: error.message,
        hint: 'Run "bunterm list" to see available sessions.'
      };

    case 'TMUX_NOT_INSTALLED':
      return {
        message: error.message,
        hint: 'Install tmux to use this feature, or use native terminal mode.'
      };

    case 'TMUX_SESSION_NOT_FOUND':
      return {
        message: error.message,
        hint: 'Run "tmux list-sessions" to see available tmux sessions.'
      };

    case 'CONFIG_NOT_FOUND':
      return {
        message: error.message,
        hint: 'Create a config.yaml file or use default settings.'
      };

    case 'CONFIG_INVALID_YAML':
    case 'CONFIG_VALIDATION_FAILED':
      return {
        message: error.message,
        hint: 'Check config.yaml syntax and field values.'
      };

    case 'PATH_TRAVERSAL':
      return {
        message: 'Access denied: path traversal attempt detected.',
        hint: undefined
      };

    default:
      return {
        message: error.message,
        hint: undefined
      };
  }
}

/**
 * Format error for CLI output with optional hint.
 */
export function formatCliError(error: AnyDomainError): string {
  const rendered = renderCliError(error);
  if (rendered.hint) {
    return `${rendered.message}\n${rendered.hint}`;
  }
  return rendered.message;
}

// === HTTP Status Code Mapping ===

/**
 * Map domain error codes to HTTP status codes
 */
export function toHttpStatus(error: AnyDomainError): number {
  switch (error.code) {
    // Not Found → 404
    case 'SESSION_NOT_FOUND':
    case 'FILE_NOT_FOUND':
    case 'TMUX_SESSION_NOT_FOUND':
    case 'CONFIG_NOT_FOUND':
    case 'BLOCK_NOT_FOUND':
    case 'NOT_FOUND':
      return 404;

    // Conflict → 409
    case 'SESSION_ALREADY_EXISTS':
    case 'DAEMON_ALREADY_RUNNING':
    case 'BLOCK_ALREADY_RUNNING':
      return 409;

    // Bad Request → 400
    case 'SESSION_INVALID_NAME':
    case 'CONFIG_INVALID_YAML':
    case 'CONFIG_VALIDATION_FAILED':
    case 'VALIDATION_FAILED':
      return 400;

    // Forbidden → 403
    case 'PATH_TRAVERSAL':
      return 403;

    // Unauthorized → 401
    case 'UNAUTHORIZED':
      return 401;

    // Method Not Allowed → 405
    case 'METHOD_NOT_ALLOWED':
      return 405;

    // Service Unavailable → 503
    case 'DAEMON_NOT_RUNNING':
    case 'DAEMON_UNAVAILABLE':
    case 'DAEMON_START_FAILED':
    case 'TMUX_NOT_INSTALLED':
    case 'FILE_READ_ERROR':
      return 503;

    default:
      return 500;
  }
}
