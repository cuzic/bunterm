/**
 * Tests for TerminalSession.injectOSC633() and side-channel dedup
 *
 * The OSC 633 side-channel allows the osc633-sender binary to bypass tmux
 * passthrough by sending sequences directly via HTTP. To prevent double-processing
 * (once from the side-channel and once from stdout), a dedup guard skips the
 * stdout copy of the same sequence within 200ms.
 *
 * Key design:
 *   injectOSC633(seq) → calls handleOSC633Sequence(seq) → arms dedup state
 *   handleOSC633Sequence(seq) → if dedup state matches type & elapsed < 200ms → skip + clear
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { BlockModel } from '@/features/blocks/server/block-model.js';
import { TerminalSession } from './session.js';
import { nullPlugins } from './session-plugins.js';

// === Helpers ===

/** Create a session that does not require PTY (no start() call) */
function createSession(name = 'test-session'): TerminalSession {
  return new TerminalSession(
    {
      name,
      command: ['cat'],
      cwd: '/tmp'
    },
    { ...nullPlugins, blockManager: new BlockModel('/tmp') }
  );
}

/** Access private fields for verification */
function getPrivate(session: TerminalSession): {
  pendingCommand: string | null;
  lastInjectedOsc633: { type: string; timestamp: number } | null;
  blockUIEnabled: boolean;
} {
  // biome-ignore lint: accessing private fields for test verification
  return session as unknown as {
    pendingCommand: string | null;
    lastInjectedOsc633: { type: string; timestamp: number } | null;
    blockUIEnabled: boolean;
  };
}

/** Call the private handleOSC633Sequence via the public injectOSC633 but first
 *  manually arm the dedup state, simulating "stdout arrived after inject" */
function simulateStdoutSequence(session: TerminalSession, type: string, data?: string): void {
  // Drive handleOSC633Sequence indirectly by calling handleOutput with a
  // raw OSC 633 escape sequence, so the internal parser routes it through.
  const seqStr = `\x1b]633;${type}${data !== undefined ? `;${data}` : ''}\x07`;
  // biome-ignore lint: calling private method for test simulation
  (session as unknown as { handleOutput(d: Uint8Array): void }).handleOutput(
    new TextEncoder().encode(seqStr)
  );
}

// === Tests ===

describe('TerminalSession.injectOSC633() – basic processing', () => {
  let session: TerminalSession;

  beforeEach(() => {
    session = createSession();
  });

  afterEach(async () => {
    await session.stop();
  });

  test('type E sets pendingCommand on the blockModel side', () => {
    session.injectOSC633({ type: 'E', data: 'ls -la' });

    expect(getPrivate(session).pendingCommand).toBe('ls -la');
  });

  test('type E unescapes OSC 633 command encoding', () => {
    // OSC 633 E encoding: \\n → newline, \\; → semicolon
    session.injectOSC633({ type: 'E', data: 'echo hello\\nworld' });

    expect(getPrivate(session).pendingCommand).toBe('echo hello\nworld');
  });

  test('type E with no data does not clear existing pendingCommand', () => {
    session.injectOSC633({ type: 'E', data: 'initial-cmd' });
    session.injectOSC633({ type: 'E' }); // no data

    expect(getPrivate(session).pendingCommand).toBe('initial-cmd');
  });

  test('type C starts a block when pendingCommand is set', () => {
    session.injectOSC633({ type: 'E', data: 'echo hello' });
    session.injectOSC633({ type: 'C' });

    expect(session.blocks).toHaveLength(1);
    expect(session.blocks[0].command).toBe('echo hello');
    expect(session.blocks[0].status).toBe('running');
    expect(session.activeBlock).not.toBeNull();
  });

  test('type C does not start a block when no pendingCommand', () => {
    session.injectOSC633({ type: 'C' });

    expect(session.blocks).toHaveLength(0);
    expect(session.activeBlock).toBeNull();
  });

  test('type D ends the active block with exit code', () => {
    session.injectOSC633({ type: 'E', data: 'ls' });
    session.injectOSC633({ type: 'C' });
    session.injectOSC633({ type: 'D', data: '0' });

    expect(session.blocks).toHaveLength(1);
    expect(session.blocks[0].status).toBe('success');
    expect(session.blocks[0].exitCode).toBe(0);
    expect(session.activeBlock).toBeNull();
  });

  test('type D with non-zero exit code marks block as error', () => {
    session.injectOSC633({ type: 'E', data: 'bad-cmd' });
    session.injectOSC633({ type: 'C' });
    session.injectOSC633({ type: 'D', data: '127' });

    expect(session.blocks[0].status).toBe('error');
    expect(session.blocks[0].exitCode).toBe(127);
  });

  test('type A and B do not cause side-effects', () => {
    session.injectOSC633({ type: 'A' });
    session.injectOSC633({ type: 'B' });

    expect(session.blocks).toHaveLength(0);
    expect(session.activeBlock).toBeNull();
    expect(getPrivate(session).pendingCommand).toBeNull();
  });

  test('type P with Cwd updates blockModel cwd', () => {
    session.injectOSC633({ type: 'E', data: 'pwd' });
    session.injectOSC633({ type: 'P', data: 'Cwd=/home/user' });
    session.injectOSC633({ type: 'C' });

    expect(session.blocks[0].cwd).toBe('/home/user');
  });

  test('type P with unknown property is silently ignored', () => {
    session.injectOSC633({ type: 'P', data: 'Unknown=value' });

    expect(session.blocks).toHaveLength(0);
  });

  test('blockUIEnabled=false causes injectOSC633 to be a no-op', () => {
    session.setBlockUIEnabled(false);
    session.injectOSC633({ type: 'E', data: 'cmd' });
    session.injectOSC633({ type: 'C' });

    expect(session.blocks).toHaveLength(0);
    expect(getPrivate(session).pendingCommand).toBeNull();
  });
});

describe('TerminalSession.injectOSC633() – dedup guard', () => {
  let session: TerminalSession;

  beforeEach(() => {
    session = createSession();
  });

  afterEach(async () => {
    await session.stop();
  });

  test('injectOSC633 arms the dedup state after processing', () => {
    session.injectOSC633({ type: 'E', data: 'cmd' });

    const priv = getPrivate(session);
    expect(priv.lastInjectedOsc633).not.toBeNull();
    expect(priv.lastInjectedOsc633?.type).toBe('E');
    expect(typeof priv.lastInjectedOsc633?.timestamp).toBe('number');
  });

  test('stdout duplicate of same type within 200ms is skipped', () => {
    // Inject 'E' via side-channel → processes → arms dedup
    session.injectOSC633({ type: 'E', data: 'cmd-from-side-channel' });
    expect(getPrivate(session).pendingCommand).toBe('cmd-from-side-channel');

    // Simulate the same sequence arriving via stdout within 200ms
    simulateStdoutSequence(session, 'E', 'cmd-from-stdout');

    // pendingCommand should NOT be overwritten (stdout was deduped)
    expect(getPrivate(session).pendingCommand).toBe('cmd-from-side-channel');
  });

  test('stdout duplicate clears the dedup state after skipping', () => {
    session.injectOSC633({ type: 'E', data: 'cmd' });
    simulateStdoutSequence(session, 'E', 'duplicate');

    // Dedup state should be cleared
    expect(getPrivate(session).lastInjectedOsc633).toBeNull();
  });

  test('stdout sequence of a different type is NOT skipped', () => {
    // Inject 'E' → arms dedup for 'E'
    session.injectOSC633({ type: 'E', data: 'cmd' });

    // Simulate 'C' via stdout — different type → should NOT be deduped
    simulateStdoutSequence(session, 'C');

    // 'C' should have started a block (pendingCommand was 'cmd')
    expect(session.blocks).toHaveLength(1);
    expect(session.blocks[0].command).toBe('cmd');
  });

  test('stdout sequence after 200ms is NOT skipped', async () => {
    // Arm dedup with a timestamp 201ms in the past
    const pastTimestamp = Date.now() - 201;
    getPrivate(session).lastInjectedOsc633 = { type: 'E', timestamp: pastTimestamp };
    getPrivate(session).pendingCommand = 'old-cmd';

    // Simulate 'E' via stdout — same type but 201ms elapsed → NOT deduped
    simulateStdoutSequence(session, 'E', 'new-cmd');

    // pendingCommand should be updated (not deduped)
    expect(getPrivate(session).pendingCommand).toBe('new-cmd');
  });

  test('dedup only fires once per injection', () => {
    // Inject once → arms dedup
    session.injectOSC633({ type: 'E', data: 'cmd' });

    // First stdout duplicate → deduped, clears state
    simulateStdoutSequence(session, 'E', 'dup1');
    expect(getPrivate(session).lastInjectedOsc633).toBeNull();

    // Second stdout with same type → NOT deduped (state was cleared)
    simulateStdoutSequence(session, 'E', 'dup2');
    expect(getPrivate(session).pendingCommand).toBe('dup2');
  });

  test('sequential injectOSC633 calls each arm dedup independently', () => {
    // Inject E → process → arm dedup for E
    session.injectOSC633({ type: 'E', data: 'cmd1' });
    expect(getPrivate(session).lastInjectedOsc633?.type).toBe('E');

    // Inject C → process → arm dedup for C (overwrites E dedup)
    session.injectOSC633({ type: 'C' });
    expect(getPrivate(session).lastInjectedOsc633?.type).toBe('C');

    // Stdout C arrives → deduped
    const blocksBefore = session.blocks.length;
    simulateStdoutSequence(session, 'C');
    expect(session.blocks.length).toBe(blocksBefore); // no additional block
  });
});
