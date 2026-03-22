/**
 * Route Helpers
 *
 * Minimal helpers for quote routes.
 * These simplify common patterns without hiding control flow.
 */

import type { z } from 'zod';
import { parseSearchParams } from './params.js';
import { failureResponse } from './response.js';

/**
 * Parse params and return T or Response directly.
 *
 * Use with instanceof check for early return:
 * ```
 * const params = parseParams(ctx.params, Schema, ctx.headers);
 * if (params instanceof Response) return params;
 * // params is now T
 * ```
 */
export function parseParams<T>(
  params: URLSearchParams,
  schema: z.ZodSchema<T>,
  headers: Record<string, string>
): T | Response {
  const result = parseSearchParams(params, schema);
  if (!result.ok) {
    return failureResponse(result.error, headers, 400);
  }
  return result.value;
}
