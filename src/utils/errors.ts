/**
 * Application-specific error class with structured error information
 */
export class AppError extends Error {
  public readonly code?: string;

  constructor(message: string, code?: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AppError';
    this.code = code;
  }

  static wrap(error: unknown, message: string, code?: string): AppError {
    return new AppError(message, code, error);
  }
}

/**
 * CLI-specific error that carries an exit code.
 * Throw this instead of calling process.exit() directly.
 */
export class CliError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }

  /**
   * Create from unknown error
   */
  static from(error: unknown, prefix?: string): CliError {
    const message = getErrorMessage(error);
    const fullMessage = prefix ? `${prefix}: ${message}` : message;
    return new CliError(fullMessage);
  }
}

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

/**
 * Format error for CLI output
 */
export function formatCliError(prefix: string, error: unknown): string {
  return `${prefix}: ${getErrorMessage(error)}`;
}

/**
 * Handle CLI command errors consistently
 */
export function handleCliError(prefix: string, error: unknown): void {
  console.error(formatCliError(prefix, error));
}

/**
 * Wrap a function with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  errorPrefix: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    handleCliError(errorPrefix, error);
    return null;
  }
}

/**
 * Assert that hostname is provided, throw CliError if not
 */
export function requireHostname(hostname: string | undefined): asserts hostname is string {
  if (!hostname) {
    throw new CliError('--hostname is required (or set hostname in config.yaml)');
  }
}
