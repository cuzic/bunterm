/**
 * Claude CLI Runner
 *
 * Runs queries using the `claude` CLI tool (Claude Code / claude-cli).
 */

import { CLIRunner } from '../runner.js';
import type { RunRequest, RunResult, RunnerCapabilities, RunnerName } from '../types.js';

export class ClaudeRunner extends CLIRunner {
  readonly name: RunnerName = 'claude';
  protected readonly cliCommand = 'claude';
  protected readonly versionFlag = '--version';

  capabilities(): RunnerCapabilities {
    return {
      supportsStreaming: true,
      supportsConversation: true,
      maxContextLength: 200000, // Claude 3.5 context window
      supportedFeatures: ['code-analysis', 'error-explanation', 'command-suggestion']
    };
  }

  /**
   * Check if Claude CLI is authenticated
   */
  protected override async checkAuthentication(): Promise<boolean> {
    try {
      // Try to run a simple check
      const proc = Bun.spawn(['claude', '--help'], {
        stdout: 'pipe',
        stderr: 'pipe'
      });

      const exitCode = await proc.exited;
      return exitCode === 0;
    } catch {
      return false;
    }
  }

  async run(request: RunRequest): Promise<RunResult> {
    const startTime = Date.now();

    try {
      // Build the prompt with context
      const fullPrompt = this.buildPrompt(request);

      // Run claude CLI with -p flag for print mode
      const args = ['-p', fullPrompt];

      // Add system prompt if provided
      if (request.systemPrompt) {
        args.unshift('--system', request.systemPrompt);
      }

      const proc = Bun.spawn(['claude', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          // Disable interactive features
          CI: 'true'
        }
      });

      const [exitCode, stdout, stderr] = await Promise.all([
        proc.exited,
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ]);

      const durationMs = Date.now() - startTime;

      if (exitCode !== 0) {
        return {
          content: '',
          raw: stdout,
          error: stderr || `Claude CLI exited with code ${exitCode}`,
          durationMs
        };
      }

      return {
        content: stdout.trim(),
        raw: stdout,
        durationMs
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      return {
        content: '',
        error: error instanceof Error ? error.message : 'Failed to run Claude CLI',
        durationMs
      };
    }
  }

  /**
   * Build the full prompt with context
   */
  private buildPrompt(request: RunRequest): string {
    const parts: string[] = [];

    // Add context if provided
    if (request.context) {
      parts.push('## Context\n');
      parts.push(request.context);
      parts.push('\n');
    }

    // Add the question
    parts.push('## Question\n');
    parts.push(request.prompt);

    // Add response format instructions
    parts.push('\n\n## Response Format\n');
    parts.push('Please respond with a JSON object containing:\n');
    parts.push('- `answer`: Your answer to the question\n');
    parts.push('- `citations`: Array of {blockId, reason} for blocks you referenced\n');
    parts.push(
      '- `nextCommands`: Array of {command, description, risk} for suggested commands (risk: "safe", "caution", or "dangerous")\n'
    );
    parts.push('\nIf you cannot provide JSON, respond with plain text.');

    return parts.join('');
  }

  /**
   * Stream execution using Claude CLI
   */
  async *stream(request: RunRequest): AsyncIterable<{
    type: 'content' | 'done' | 'error';
    content?: string;
    error?: string;
  }> {
    try {
      const fullPrompt = this.buildPrompt(request);
      const args = ['-p', fullPrompt];

      if (request.systemPrompt) {
        args.unshift('--system', request.systemPrompt);
      }

      const proc = Bun.spawn(['claude', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
          CI: 'true'
        }
      });

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        if (text) {
          yield { type: 'content', content: text };
        }
      }

      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        yield { type: 'error', error: stderr || `Exit code: ${exitCode}` };
      } else {
        yield { type: 'done' };
      }
    } catch (error) {
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : 'Stream failed'
      };
    }
  }
}
