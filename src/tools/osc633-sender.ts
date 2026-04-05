/**
 * OSC 633 Side-Channel Sender
 *
 * Minimal CLI tool that sends OSC 633 sequences to bunterm daemon
 * via Unix socket HTTP API, bypassing tmux passthrough requirements.
 *
 * Usage: osc633-sender <session> <type> [data]
 *   session: bunterm session name
 *   type:    OSC 633 type (A, B, C, D, E, P)
 *   data:    optional data (e.g., exit code for D, command for E)
 *
 * Environment:
 *   BUNTERM_API_SOCK: path to bunterm API Unix socket
 *
 * Built with: bun build --compile src/tools/osc633-sender.ts --outfile dist/osc633-sender
 */

const session = process.argv[2];
const type = process.argv[3];
const data = process.argv[4];

if (!session || !type) {
  process.exit(1);
}

const socketPath = process.env['BUNTERM_API_SOCK'];
if (!socketPath) {
  process.exit(1);
}

try {
  await fetch('http://localhost/api/osc633', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, type, data }),
    signal: AbortSignal.timeout(2000),
    unix: socketPath
  } as RequestInit);
} catch {
  // Silently fail — never block the shell
}
