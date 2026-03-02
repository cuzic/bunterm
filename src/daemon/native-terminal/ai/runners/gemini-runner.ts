/**
 * Gemini CLI Runner
 *
 * Runs queries using Google's Gemini CLI tool.
 */

import { CLIRunner } from '../runner.js';
import type { RunRequest, RunResult, RunnerCapabilities, RunnerName } from '../types.js';

export class GeminiRunner extends CLIRunner {
  readonly name: RunnerName = 'gemini';
  protected readonly cliCommand = 'gemini';
  protected readonly versionFlag = '--version';

  capabilities(): RunnerCapabilities {
    return {
      supportsStreaming: true,
      supportsConversation: true,
      maxContextLength: 1000000, // Gemini 1.5 Pro context window
      supportedFeatures: ['code-analysis', 'error-explanation', 'command-suggestion']
    };
  }

  /**
   * Check if Gemini CLI is authenticated
   */
  protected override async checkAuthentication(): Promise<boolean> {
    try {
      // Check if GOOGLE_API_KEY or GEMINI_API_KEY is set
      if (process.env['GOOGLE_API_KEY'] || process.env['GEMINI_API_KEY']) {
        return true;
      }

      // Try running help command
      const proc = Bun.spawn(['gemini', '--help'], {
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

      // Run gemini CLI
      // Adjust arguments based on actual Gemini CLI implementation
      const args = ['--prompt', fullPrompt];

      if (request.systemPrompt) {
        args.unshift('--system', request.systemPrompt);
      }

      const proc = Bun.spawn(['gemini', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          ...process.env,
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
          error: stderr || `Gemini CLI exited with code ${exitCode}`,
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
        error: error instanceof Error ? error.message : 'Failed to run Gemini CLI',
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
      parts.push('\n\n');
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
   * Stream execution using Gemini CLI
   */
  async *stream(request: RunRequest): AsyncIterable<{
    type: 'content' | 'done' | 'error';
    content?: string;
    error?: string;
  }> {
    try {
      const fullPrompt = this.buildPrompt(request);
      const args = ['--prompt', fullPrompt, '--stream'];

      if (request.systemPrompt) {
        args.unshift('--system', request.systemPrompt);
      }

      const proc = Bun.spawn(['gemini', ...args], {
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
