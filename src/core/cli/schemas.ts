/**
 * CLI Options Schemas
 *
 * Zod schemas for validating CLI command options.
 * These schemas ensure type-safe option handling at runtime.
 */

import { z } from 'zod';

// === Common Options ===

/**
 * Config path option - used by most commands
 */
export const ConfigPathSchema = z.string().optional();

// === Up Command ===

export const UpOptionsSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  config: ConfigPathSchema
});

export type UpOptions = z.infer<typeof UpOptionsSchema>;

// === Down Command ===

export const DownOptionsSchema = z.object({
  config: ConfigPathSchema
});

export type DownOptions = z.infer<typeof DownOptionsSchema>;

// === Status Command ===

export const StatusOptionsSchema = z.object({
  config: ConfigPathSchema,
  json: z.boolean().optional()
});

export type StatusOptions = z.infer<typeof StatusOptionsSchema>;

// === List Command ===

export const ListOptionsSchema = z.object({
  config: ConfigPathSchema,
  long: z.boolean().optional(),
  url: z.boolean().optional(),
  json: z.boolean().optional()
});

export type ListOptions = z.infer<typeof ListOptionsSchema>;

// === Daemon Command ===

export const DaemonOptionsSchema = z.object({
  foreground: z.boolean().optional(),
  config: ConfigPathSchema,
  sessions: z.boolean().optional(),
  select: z.boolean().optional()
});

export type DaemonOptions = z.infer<typeof DaemonOptionsSchema>;

// === Shutdown Command ===

export const ShutdownOptionsSchema = z.object({
  config: ConfigPathSchema,
  stopSessions: z.boolean().optional()
});

export type ShutdownOptions = z.infer<typeof ShutdownOptionsSchema>;

// === Reload Command ===

export const ReloadOptionsSchema = z.object({
  config: ConfigPathSchema
});

export type ReloadOptions = z.infer<typeof ReloadOptionsSchema>;

// === Restart Command ===

export const RestartOptionsSchema = z.object({
  config: ConfigPathSchema
});

export type RestartOptions = z.infer<typeof RestartOptionsSchema>;

// === Doctor Command ===

export const DoctorOptionsSchema = z.object({
  config: ConfigPathSchema,
  json: z.boolean().optional()
});

export type DoctorOptions = z.infer<typeof DoctorOptionsSchema>;

// === Deploy Command ===

export const DeployOptionsSchema = z.object({
  hostname: z.string().optional(),
  output: z.string().optional(),
  config: ConfigPathSchema
});

export type DeployOptions = z.infer<typeof DeployOptionsSchema>;

// === Share Command ===

export const ShareCreateOptionsSchema = z.object({
  expires: z
    .string()
    .regex(/^\d+[smhd]$/, 'Invalid duration format (e.g., 1h, 30m, 7d)')
    .optional()
    .default('1h')
});

export type ShareCreateOptions = z.infer<typeof ShareCreateOptionsSchema>;

export const ShareListOptionsSchema = z.object({
  json: z.boolean().optional()
});

export type ShareListOptions = z.infer<typeof ShareListOptionsSchema>;

// === Caddy Commands ===

export const CaddySnippetOptionsSchema = z.object({
  config: ConfigPathSchema
});

export type CaddySnippetOptions = z.infer<typeof CaddySnippetOptionsSchema>;

export const CaddySetupOptionsSchema = z.object({
  hostname: z.string().optional(),
  adminApi: z.string().url().optional(),
  config: ConfigPathSchema
});

export type CaddySetupOptions = z.infer<typeof CaddySetupOptionsSchema>;

export const CaddyRemoveOptionsSchema = z.object({
  hostname: z.string().optional(),
  adminApi: z.string().url().optional(),
  config: ConfigPathSchema
});

export type CaddyRemoveOptions = z.infer<typeof CaddyRemoveOptionsSchema>;

export const CaddySyncOptionsSchema = z.object({
  hostname: z.string().optional(),
  adminApi: z.string().url().optional(),
  config: ConfigPathSchema
});

export type CaddySyncOptions = z.infer<typeof CaddySyncOptionsSchema>;

export const CaddyStatusOptionsSchema = z.object({
  adminApi: z.string().url().optional(),
  config: ConfigPathSchema
});

export type CaddyStatusOptions = z.infer<typeof CaddyStatusOptionsSchema>;

// === OTP Command ===

export const OtpOptionsSchema = z.object({
  config: ConfigPathSchema,
  ttl: z.number().int().min(30).max(300).optional()
});

export type OtpOptions = z.infer<typeof OtpOptionsSchema>;

// === Parse Helpers ===

/**
 * Parse CLI options with schema validation
 * Returns the parsed data or throws with user-friendly error
 */
export function parseCliOptions<T>(
  options: unknown,
  schema: z.ZodSchema<T>,
  commandName: string
): T {
  const result = schema.safeParse(options);
  if (result.success) {
    return result.data;
  }
  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'option';
  throw new Error(
    `Invalid ${commandName} option "${field}": ${issue?.message ?? 'validation failed'}`
  );
}
