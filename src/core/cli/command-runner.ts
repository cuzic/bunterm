/**
 * Command Runner
 *
 * Wraps CLI command execution with unified error handling.
 * Commands throw CliError instead of calling process.exit() directly.
 * Commands may return an exit code (number) for special cases like tmux attach.
 *
 * Supports two patterns:
 * 1. Exception-based: Commands throw CliError
 * 2. Result-based: Commands return Result<void | number, DomainError>
 */

import { type AnyDomainError, formatCliError, toCliExitCode } from '@/core/errors.js';
import { CliError, getErrorMessage } from '@/utils/errors.js';
import { isErr, type Result } from '@/utils/result.js';

type CommandResult = undefined | number;
type CommandFn = () => Promise<CommandResult> | CommandResult;

// Result-based command types
type ResultCommandResult = Result<undefined | number, AnyDomainError>;
type ResultCommandFn = () => Promise<ResultCommandResult> | ResultCommandResult;

/**
 * Run a CLI command with unified error handling.
 * - If command returns void → exit 0
 * - If command returns a number → exit with that code
 * - If command throws CliError → print message and exit with CliError.exitCode
 * - If command throws other error → print message and exit 1
 */
async function runCommand(fn: CommandFn): Promise<void> {
  try {
    const result = await fn();
    // If command returns an exit code, use it
    if (typeof result === 'number') {
      process.exit(result);
    }
    // Otherwise, successful completion
  } catch (error) {
    if (error instanceof CliError) {
      if (!error.silent && error.message) {
        console.error(`Error: ${error.message}`);
      }
      process.exit(error.exitCode);
    }

    // Unexpected error
    console.error(`Error: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * Create a wrapped command action for Commander.
 * Handles both sync and async command functions.
 */
export function wrapCommand<T extends unknown[]>(
  fn: (...args: T) => Promise<CommandResult> | CommandResult
): (...args: T) => void {
  return (...args: T) => {
    runCommand(() => fn(...args));
  };
}

// === Result-based Command Execution ===

/**
 * Run a CLI command that returns Result.
 * - If Result is Ok with void → exit 0
 * - If Result is Ok with number → exit with that code
 * - If Result is Err → print message and exit with mapped exit code
 */
async function runResultCommand(fn: ResultCommandFn): Promise<void> {
  try {
    const result = await fn();

    if (isErr(result)) {
      console.error(`Error: ${formatCliError(result.error)}`);
      process.exit(toCliExitCode(result.error));
    }

    // Ok result
    if (typeof result.value === 'number') {
      process.exit(result.value);
    }
    // void → successful completion (exit 0)
  } catch (error) {
    // Unexpected error (should not happen in well-behaved commands)
    console.error(`Error: ${getErrorMessage(error)}`);
    process.exit(1);
  }
}

/**
 * Create a wrapped Result-returning command action for Commander.
 */
function wrapResultCommand<T extends unknown[]>(
  fn: (...args: T) => Promise<ResultCommandResult> | ResultCommandResult
): (...args: T) => void {
  return (...args: T) => {
    runResultCommand(() => fn(...args));
  };
}
