/**
 * Daemon Waiter
 *
 * Utilities for waiting for daemon state changes.
 */

import { isDaemonRunning } from './daemon-probe.js';

export const DAEMON_START_TIMEOUT = 5000;
export const DAEMON_STOP_TIMEOUT = 5000;
const DAEMON_CHECK_INTERVAL = 100;

/**
 * Poll until condition returns true, or timeout.
 */
function waitForCondition(
  condition: () => Promise<boolean>,
  timeout: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const check = async () => {
      if (Date.now() - startTime >= timeout) {
        clearInterval(intervalId);
        resolve(false);
        return;
      }

      if (await condition()) {
        clearInterval(intervalId);
        resolve(true);
      }
    };

    const intervalId = setInterval(check, DAEMON_CHECK_INTERVAL);
    check();
  });
}

/**
 * Wait for daemon to become ready
 */
export function waitForDaemon(): Promise<boolean> {
  return waitForCondition(() => isDaemonRunning(), DAEMON_START_TIMEOUT);
}

/**
 * Wait for daemon to stop
 */
export function waitForDaemonStop(): Promise<boolean> {
  return waitForCondition(async () => !(await isDaemonRunning()), DAEMON_STOP_TIMEOUT);
}
