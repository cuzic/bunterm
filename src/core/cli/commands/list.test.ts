import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { resetDaemonClientDeps, setDaemonClientDeps } from '@/core/client/daemon-client.js';
import { createInMemoryStateStore } from '@/core/config/state-store.js';
import { createMockSocketClient } from '@/utils/socket-client.js';
import { listCommand } from './list.js';

describe('list command', () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let logs: string[];

  beforeEach(() => {
    logs = [];
    consoleLogSpy = spyOn(console, 'log').mockImplementation((msg: string) => {
      logs.push(msg);
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    resetDaemonClientDeps();
  });

  test('prints message when daemon is not running', async () => {
    const stateStore = createInMemoryStateStore();
    const socketClient = createMockSocketClient({ exists: () => false });
    setDaemonClientDeps({ stateStore, socketClient });

    await listCommand({});

    expect(logs).toContain('Daemon is not running.');
    expect(logs.some((l) => l.includes('bunterm up'))).toBe(true);
  });

  test('outputs JSON when daemon is not running with --json', async () => {
    const stateStore = createInMemoryStateStore();
    const socketClient = createMockSocketClient({ exists: () => false });
    setDaemonClientDeps({ stateStore, socketClient });

    await listCommand({ json: true });

    expect(logs.length).toBe(1);
    const json = JSON.parse(logs[0]!);
    expect(json.daemon).toBe(false);
    expect(json.sessions).toEqual([]);
  });
});

describe('list command helpers', () => {
  test('buildSessionUrl is exported from helper module', async () => {
    const { buildSessionUrl } = await import('@/core/cli/helpers/url-builder.js');
    expect(typeof buildSessionUrl).toBe('function');
  });

  test('guardDaemon is exported from helper module', async () => {
    const { guardDaemon } = await import('@/core/cli/helpers/daemon-guard.js');
    expect(typeof guardDaemon).toBe('function');
  });
});
