/**
 * Runner Interface
 *
 * Abstract interface for LLM CLI runners.
 * Implementations: ClaudeRunner, CodexRunner, GeminiRunner
 */

import type {
  RunChunk,
  RunRequest,
  RunResult,
  RunnerCapabilities,
  RunnerName,
  RunnerStatus
} from './types.js';

/**
 * Base interface for LLM runners
 */
export interface Runner {
  /** Runner name */
  readonly name: RunnerName;

  /**
   * Check if the runner is available and authenticated
   */
  checkAvailability(): Promise<RunnerStatus>;

  /**
   * Get runner capabilities
   */
  capabilities(): RunnerCapabilities;

  /**
   * Execute a run request and return the result
   */
  run(request: RunRequest): Promise<RunResult>;

  /**
   * Stream execution (optional)
   */
  stream?(request: RunRequest): AsyncIterable<RunChunk>;
}

/**
 * Base class for CLI-based runners
 */
export abstract class CLIRunner implements Runner {
  abstract readonly name: RunnerName;
  protected abstract readonly cliCommand: string;
  protected abstract readonly versionFlag: string;

  /**
   * Check CLI availability by running version command
   */
  async checkAvailability(): Promise<RunnerStatus> {
    try {
      const proc = Bun.spawn([this.cliCommand, this.versionFlag], {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      if (exitCode === 0) {
        const version = this.parseVersion(stdout);
        const authenticated = await this.checkAuthentication();

        return {
          name: this.name,
          available: true,
          authenticated,
          version,
          error: authenticated ? undefined : 'Not authenticated'
        };
      }

      return {
        name: this.name,
        available: false,
        authenticated: false,
        error: stderr || 'CLI not available'
      };
    } catch (error) {
      return {
        name: this.name,
        available: false,
        authenticated: false,
        error: error instanceof Error ? error.message : 'CLI not found'
      };
    }
  }

  /**
   * Parse version from CLI output
   */
  protected parseVersion(output: string): string {
    // Default: return first line
    const firstLine = output.split('\n')[0]?.trim() ?? '';
    const versionMatch = firstLine.match(/(\d+\.\d+\.\d+)/);
    return versionMatch?.[1] ?? firstLine;
  }

  /**
   * Check if authenticated (override in subclass)
   */
  protected async checkAuthentication(): Promise<boolean> {
    return true;
  }

  abstract capabilities(): RunnerCapabilities;
  abstract run(request: RunRequest): Promise<RunResult>;
}

/**
 * Disabled runner (placeholder when no runner is available)
 */
export class DisabledRunner implements Runner {
  readonly name: RunnerName = 'disabled';

  async checkAvailability(): Promise<RunnerStatus> {
    return {
      name: 'disabled',
      available: false,
      authenticated: false,
      error: 'AI features are disabled'
    };
  }

  capabilities(): RunnerCapabilities {
    return {
      supportsStreaming: false,
      supportsConversation: false,
      maxContextLength: 0,
      supportedFeatures: []
    };
  }

  async run(_request: RunRequest): Promise<RunResult> {
    return {
      content: 'AI features are disabled. No runner is available.',
      error: 'AI features are disabled',
      durationMs: 0
    };
  }
}
