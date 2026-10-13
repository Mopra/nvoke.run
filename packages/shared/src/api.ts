import { z } from 'zod';

/**
 * Wire contracts between apps/desktop and apps/server. Both sides parse with
 * these schemas, so a change here is a change to the API.
 */

export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** The signed-in user as the server sees them, after verifying the Clerk token. */
export const MeResponse = z.object({
  userId: z.string(),
  sessionId: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ApiError = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;
