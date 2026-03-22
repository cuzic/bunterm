/**
 * Route Parameter Schemas
 *
 * Zod schemas for validating and parsing route parameters.
 * All parameters are validated at the boundary before business logic.
 *
 * ## Validation Policy
 * - Invalid parameters return 400 error (no silent fallback to defaults)
 * - Missing optional parameters use defaults
 * - Invalid format (e.g., "abc" for count) returns error
 *
 * ## Shared Schema Policy
 *
 * Only add to shared schemas if ALL of these apply:
 * 1. Used by 3+ routes with identical validation rules
 * 2. The validation is truly the same (not "similar but slightly different")
 * 3. The schema is small and focused (single responsibility)
 *
 * Do NOT share if:
 * - The validation might diverge between routes
 * - It's only used by 1-2 routes (just inline it)
 * - The schema has route-specific constraints
 *
 * When in doubt, start with inline validation and extract later.
 */

import { z } from 'zod';

// === Shared Schemas ===
//
// These are small, reusable validators for common parameter types.
// Each is used by 3+ routes with identical semantics.

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

/** Session name parameter */
const sessionNameSchema = z.string().min(1, 'session is required').max(64);

/** Claude session ID parameter */
const claudeSessionIdSchema = z.string().min(1, 'claudeSessionId is required');

/** Project path parameter */
const projectPathSchema = z.string().min(1, 'projectPath is required');

/** File path parameter */
const filePathSchema = z.string().min(1, 'path is required');

// === Route Parameter Schemas ===

/**
 * /recent-markdown route parameters
 *
 * Locator (one of):
 * - bunterm: session
 * - Claude: claudeSessionId + projectPath
 *
 * Optional: count (default: 20), hours (default: 24)
 *
 * Session/locator fields are validated by resolveWorkspaceFromParams().
 */
export const RecentMarkdownParamsSchema = z.object({
  session: sessionNameSchema.optional(),
  claudeSessionId: claudeSessionIdSchema.optional(),
  projectPath: projectPathSchema.optional(),
  count: strictCountSchema(20, 50),
  hours: strictCountSchema(24, 168)
});
export type RecentMarkdownParams = z.infer<typeof RecentMarkdownParamsSchema>;

/**
 * /recent route parameters
 *
 * Locator (one of):
 * - bunterm: session
 * - Claude: claudeSessionId + projectPath
 *
 * Optional: count (default: 20)
 *
 * Session/locator fields are validated by resolveWorkspaceFromParams().
 */
export const RecentParamsSchema = z.object({
  session: sessionNameSchema.optional(),
  claudeSessionId: claudeSessionIdSchema.optional(),
  projectPath: projectPathSchema.optional(),
  count: strictCountSchema(20, 50)
});
export type RecentParams = z.infer<typeof RecentParamsSchema>;

/**
 * /project-markdown route parameters
 *
 * Locator (one of):
 * - bunterm: session
 * - Claude: claudeSessionId + projectPath
 *
 * Optional: count (default: 10)
 *
 * Session/locator fields are validated by resolveWorkspaceFromParams().
 */
export const ProjectMarkdownParamsSchema = z.object({
  session: sessionNameSchema.optional(),
  claudeSessionId: claudeSessionIdSchema.optional(),
  projectPath: projectPathSchema.optional(),
  count: strictCountSchema(10, 50)
});
export type ProjectMarkdownParams = z.infer<typeof ProjectMarkdownParamsSchema>;

/**
 * /git-diff-file route parameters
 *
 * Locator (one of):
 * - bunterm: session
 * - Claude: claudeSessionId + projectPath
 *
 * Requires: path
 *
 * Session/locator fields are validated by resolveWorkspaceFromParams().
 */
export const GitDiffFileParamsSchema = z.object({
  session: sessionNameSchema.optional(),
  claudeSessionId: claudeSessionIdSchema.optional(),
  projectPath: projectPathSchema.optional(),
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
 * /file-content route parameters
 *
 * Requires: source, path
 *
 * When source='project':
 *   Locator (one of):
 *   - bunterm: session
 *   - Claude: claudeSessionId + projectPath
 *
 * When source='plans':
 *   No locator needed (uses ~/.claude/plans)
 *
 * Optional: preview (default: false)
 *
 * Session/locator fields are validated by resolveWorkspaceFromParams() (for source='project').
 */
export const FileContentParamsSchema = z.object({
  source: z.enum(['project', 'plans'], {
    error: 'source must be "project" or "plans"'
  }),
  path: filePathSchema,
  session: sessionNameSchema.optional(),
  claudeSessionId: claudeSessionIdSchema.optional(),
  projectPath: projectPathSchema.optional(),
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
