/**
 * Elysia Spike - Minimal Elysia app for validating Eden Treaty type inference
 */

import { Elysia } from 'elysia';

export const app = new Elysia().get('/api/health', () => ({ status: 'ok' as const }));
