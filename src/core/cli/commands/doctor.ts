/**
 * Doctor command - Check dependencies and configuration
 */

import { loadConfig } from '@/core/config/config.js';
import {
  defaultChecks,
  formatCheckResult,
  hasFailures,
  runChecks
} from '@/core/cli/services/doctor-service.js';
import { CliError } from '@/utils/errors.js';

export interface DoctorOptions {
  config?: string;
  json?: boolean;
}

/**
 * Run all checks and display results
 */
export async function doctorCommand(options: DoctorOptions): Promise<void> {
  // Try to load config for port check
  let config;
  try {
    config = loadConfig(options.config);
  } catch {
    // Config check will handle this
  }

  const results = await runChecks(defaultChecks, {
    configPath: options.config,
    config
  });

  // JSON output mode
  if (options.json) {
    const allPassed = !hasFailures(results);
    console.log(
      JSON.stringify({
        passed: allPassed,
        checks: results.map((r) => ({
          name: r.name,
          ok: r.ok,
          message: r.message,
          hint: r.hint
        }))
      })
    );
    if (!allPassed) {
      throw CliError.silent();
    }
    return;
  }

  // Text output mode
  for (const result of results) {
    console.log(formatCheckResult(result));
  }

  if (hasFailures(results)) {
    throw new CliError('Some checks failed');
  }

  console.log('\nAll checks passed.');
}
