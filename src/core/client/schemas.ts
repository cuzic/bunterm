/**
 * Daemon Client Schemas
 *
 * Zod schemas for validating daemon responses and external process outputs.
 */

import { z } from 'zod';

// === PM2 Process List Schema ===

export const Pm2ProcessSchema = z.object({
  name: z.string(),
  pid: z.number(),
  pm_id: z.number(),
  pm2_env: z
    .object({
      status: z.string(),
      restart_time: z.number(),
      pm_uptime: z.number()
    })
    .optional(),
  monit: z
    .object({
      memory: z.number(),
      cpu: z.number()
    })
    .optional()
});

export type Pm2Process = z.infer<typeof Pm2ProcessSchema>;

export const Pm2ProcessListSchema = z.array(Pm2ProcessSchema);

// === Reload Result Schema ===

export const ReloadResultSchema = z.object({
  success: z.boolean(),
  reloaded: z.array(z.string()),
  requiresRestart: z.array(z.string()),
  error: z.string().optional()
});

export type ReloadResult = z.infer<typeof ReloadResultSchema>;

// === Parse Helpers ===

/**
 * Parse PM2 process list from JSON string
 * Returns empty array on parse failure
 */
export function parsePm2ProcessList(jsonString: string): Pm2Process[] {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const result = Pm2ProcessListSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Parse reload result from JSON string
 * Returns null on parse failure
 */
export function parseReloadResult(jsonString: string): ReloadResult | null {
  try {
    const parsed: unknown = JSON.parse(jsonString);
    const result = ReloadResultSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    return null;
  } catch {
    return null;
  }
}
