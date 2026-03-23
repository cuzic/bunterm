/**
 * OTP command - Generate a 6-digit OTP for browser authentication
 */

import { type OtpOptions, OtpOptionsSchema, parseCliOptions } from '@/core/cli/schemas.js';
import { apiRequest, ensureDaemon } from '@/core/client/index.js';
import { loadConfig } from '@/core/config/config.js';
import { CliError } from '@/utils/errors.js';

export type { OtpOptions };

interface OtpGenerateResponse {
  code: string;
  expiresAt: number;
  ttlSeconds: number;
}

export async function otpCommand(rawOptions: unknown): Promise<void> {
  const options = parseCliOptions(rawOptions, OtpOptionsSchema, 'otp');
  const config = loadConfig(options.config);

  if (!config.security.auth_enabled) {
    throw new CliError(
      'Authentication is not enabled. Set security.auth_enabled: true in config.yaml'
    );
  }

  // Ensure daemon is running
  await ensureDaemon(options.config, config.daemon_manager);

  const ttlParam = options.ttl ? `?ttl=${options.ttl}` : '';
  const result = await apiRequest<OtpGenerateResponse>(
    config,
    'POST',
    `/api/auth/otp/generate${ttlParam}`
  );

  const ttl = result.ttlSeconds;

  // Display OTP prominently
  console.log('');
  console.log('  ┌─────────────────────────────┐');
  console.log('  │                             │');
  console.log(`  │     OTP:  ${result.code}          │`);
  console.log('  │                             │');
  console.log('  └─────────────────────────────┘');
  console.log('');
  console.log(`  Valid for ${ttl} seconds`);
  console.log('  Enter this code in the browser to authenticate.');
  console.log('');
}
