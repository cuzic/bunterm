/**
 * Route Parameter Schemas
 *
 * Zod schemas for validating and parsing route parameters.
 * All parameters are validated at the boundary before business logic.
 */

import { z } from 'zod';

// === Shared Schemas ===

/** Count parameter with default and max limit */
const countSchema = (defaultVal: number, max: number) =>
  z.coerce.number().int().min(1).max(max).default(defaultVal).catch(defaultVal);

/** Session name parameter */
const sessionNameSchema = z.string().min(1).max(64);

// === Route Parameter Schemas ===

/**
 * /recent-markdown route parameters
 */
export const RecentMarkdownParamsSchema = z.object({
  session: sessionNameSchema,
  count: countSchema(20, 50),
  hours: countSchema(24, 168)
});
export type RecentMarkdownParams = z.infer<typeof RecentMarkdownParamsSchema>;

/**
 * /recent route parameters (legacy mode)
 */
export const RecentParamsLegacySchema = z.object({
  session: sessionNameSchema,
  count: countSchema(20, 50)
});
export type RecentParamsLegacy = z.infer<typeof RecentParamsLegacySchema>;

/**
 * /recent route parameters (new mode with Claude session)
 */
export const RecentParamsNewSchema = z.object({
  claudeSessionId: z.string().min(1),
  projectPath: z.string().min(1),
  count: countSchema(20, 50)
});
export type RecentParamsNew = z.infer<typeof RecentParamsNewSchema>;

/**
 * /turn/:uuid route parameters (legacy mode)
 */
export const TurnParamsLegacySchema = z.object({
  session: sessionNameSchema
});
export type TurnParamsLegacy = z.infer<typeof TurnParamsLegacySchema>;

/**
 * /turn/:uuid route parameters (new mode)
 */
export const TurnParamsNewSchema = z.object({
  claudeSessionId: z.string().min(1),
  projectPath: z.string().min(1)
});
export type TurnParamsNew = z.infer<typeof TurnParamsNewSchema>;

/**
 * /project-markdown route parameters
 */
export const ProjectMarkdownParamsSchema = z.object({
  session: sessionNameSchema,
  count: countSchema(10, 50)
});
export type ProjectMarkdownParams = z.infer<typeof ProjectMarkdownParamsSchema>;

/**
 * /git-diff route parameters
 */
export const GitDiffParamsSchema = z.object({
  session: sessionNameSchema
});
export type GitDiffParams = z.infer<typeof GitDiffParamsSchema>;

/**
 * /git-diff-file route parameters
 */
export const GitDiffFileParamsSchema = z.object({
  session: sessionNameSchema,
  path: z.string().min(1)
});
export type GitDiffFileParams = z.infer<typeof GitDiffFileParamsSchema>;

/**
 * /sessions route parameters
 */
export const SessionsParamsSchema = z.object({
  limit: countSchema(10, 20)
});
export type SessionsParams = z.infer<typeof SessionsParamsSchema>;

/**
 * /plans route parameters
 */
export const PlansParamsSchema = z.object({
  count: countSchema(10, 50)
});
export type PlansParams = z.infer<typeof PlansParamsSchema>;

/**
 * /file-content route parameters
 */
export const FileContentParamsSchema = z.object({
  source: z.enum(['project', 'plans']),
  path: z.string().min(1),
  session: sessionNameSchema.optional(),
  preview: z.string().optional().transform((v) => v === 'true')
});
export type FileContentParams = z.infer<typeof FileContentParamsSchema>;

// === Parse Helper ===

/**
 * Parse result type for parameter validation
 */
export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Parse URLSearchParams with a Zod schema
 */
export function parseSearchParams<T>(
  params: URLSearchParams,
  schema: z.ZodSchema<T>
): ParseResult<T> {
  const raw: Record<string, string | undefined> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });

  const result = schema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issue = result.error.issues[0];
  const field = issue?.path.join('.') || 'parameter';
  return { ok: false, error: `Invalid ${field}: ${issue?.message ?? 'validation failed'}` };
}
