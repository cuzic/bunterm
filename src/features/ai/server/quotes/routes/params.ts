/**
 * Route Parameter Schemas
 *
 * Zod schemas for route-specific parameters (count, hours, path, etc.).
 * Locator params are validated by resolveWorkspaceFromParams().
 */

import { z } from 'zod';

// === Shared Field Schemas ===

/**
 * Strict count parameter - returns error on invalid input
 * Only missing values fall back to default
 */
const strictCountSchema = (defaultVal: number, max: number) =>
  z
    .string()
    .optional()
    .transform((val) => (val === undefined || val === '' ? defaultVal : Number(val)))
    .refine((val) => !Number.isNaN(val), { message: 'must be a number' })
    .refine((val) => Number.isInteger(val), { message: 'must be an integer' })
    .refine((val) => val >= 1, { message: 'must be at least 1' })
    .refine((val) => val <= max, { message: `must be at most ${max}` });

/** File path parameter */
const filePathSchema = z.string().min(1, 'path is required');

// === Route-Specific Parameter Schemas ===
//
// These schemas validate route-specific params only.
// Locator params (session, claudeSessionId, projectPath) are validated
// by resolveWorkspaceFromParams() / resolveClaudeFromParams() in the route.

/** /recent-markdown: count (default: 20), hours (default: 24) */
export const RecentMarkdownParamsSchema = z.object({
  count: strictCountSchema(20, 50),
  hours: strictCountSchema(24, 168)
});
export type RecentMarkdownParams = z.infer<typeof RecentMarkdownParamsSchema>;

/** /recent: count (default: 20) */
export const RecentParamsSchema = z.object({
  count: strictCountSchema(20, 50)
});
export type RecentParams = z.infer<typeof RecentParamsSchema>;

/** /project-markdown: count (default: 10) */
export const ProjectMarkdownParamsSchema = z.object({
  count: strictCountSchema(10, 50)
});
export type ProjectMarkdownParams = z.infer<typeof ProjectMarkdownParamsSchema>;

/** /git-diff-file: path (required) */
export const GitDiffFileParamsSchema = z.object({
  path: filePathSchema
});
export type GitDiffFileParams = z.infer<typeof GitDiffFileParamsSchema>;

/**
 * /sessions route parameters
 * Optional: limit (default: 10)
 */
export const SessionsParamsSchema = z.object({
  limit: strictCountSchema(10, 20)
});
export type SessionsParams = z.infer<typeof SessionsParamsSchema>;

/**
 * /plans route parameters
 * Optional: count (default: 10)
 */
export const PlansParamsSchema = z.object({
  count: strictCountSchema(10, 50)
});
export type PlansParams = z.infer<typeof PlansParamsSchema>;

/**
 * /file-content: source (required), path (required), preview (default: false)
 *
 * source='project' requires locator (validated by resolveWorkspaceFromParams)
 * source='plans' uses ~/.claude/plans (no locator needed)
 */
export const FileContentParamsSchema = z.object({
  source: z.enum(['project', 'plans'], {
    error: 'source must be "project" or "plans"'
  }),
  path: filePathSchema,
  preview: z
    .string()
    .optional()
    .transform((v) => v === 'true')
});

// === Parse Helper ===

import { type Result, err, ok } from '@/utils/result.js';

/**
 * Parse URLSearchParams with a Zod schema (field-level validation)
 *
 * Validates individual field types: count, hours, path, source, etc.
 * Does NOT validate session/locator (use resolveWorkspaceFromParams() for that).
 *
 * @returns Result<T, string> for type-safe error handling
 */
export function parseSearchParams<T>(
  params: URLSearchParams,
  schema: z.ZodSchema<T>
): Result<T, string> {
  const raw: Record<string, string | undefined> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });

  const result = schema.safeParse(raw);
  if (result.success) {
    return ok(result.data);
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'parameter';
  return err(`Invalid ${field}: ${issue?.message ?? 'validation failed'}`);
}
