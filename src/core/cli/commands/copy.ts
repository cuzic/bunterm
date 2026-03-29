/**
 * Copy command - Send stdin to browser clipboard via WebSocket
 *
 * Usage:
 *   echo "hello" | bunterm copy
 *   bunterm copy < file.txt
 *   bunterm copy -s my-session
 */

import { ensureDaemon, getSessions, sendClipboard } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { CliError } from '@/utils/errors.js';

export interface CopyOptions {
  config?: string;
  session?: string;
}

export async function copyCommand(options: CopyOptions): Promise<void> {
  const config = loadConfig(options.config);

  await ensureDaemon(options.config, config.daemon_manager);

  // Determine target session
  let sessionName = options.session;
  if (!sessionName) {
    // Use BUNTERM_SESSION env var, or find session for current directory
    sessionName = process.env['BUNTERM_SESSION'];
    if (!sessionName) {
      const sessions = await getSessions(config);
      const cwd = process.cwd();
      const match = sessions.find((s) => s.dir === cwd);
      if (match) {
        sessionName = match.name;
      } else if (sessions.length === 1) {
        sessionName = sessions[0].name;
      } else if (sessions.length === 0) {
        throw new CliError('No active sessions. Start a session with "bunterm up" first.');
      } else {
        throw new CliError(
          `Multiple sessions active. Specify one with -s:\n${sessions.map((s) => `  ${s.name}`).join('\n')}`
        );
      }
    }
  }

  // Read stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf-8');

  if (text.length === 0) {
    throw new CliError('No input. Pipe text to stdin: echo "hello" | bunterm copy');
  }

  // Send to browser clipboard
  const encoded = Buffer.from(text).toString('base64');
  await sendClipboard(config, { session: sessionName, text: encoded, encoding: 'base64' });

  process.stderr.write(`Copied ${text.length} bytes to browser clipboard\n`);
}
