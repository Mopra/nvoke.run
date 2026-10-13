import { z } from 'zod';

/**
 * Public privacy routes (no sign-in). The site's opt-out page calls these.
 * Responses never say whether nvoke held the address, so the routes cannot be
 * used to test which addresses are in the data.
 */

/**
 * `POST /v1/privacy/opt-out`: stop collecting and delete an address, or a
 * whole domain. Takes effect at once and cannot be undone through the API.
 */
export const OptOutRequest = z.union([
  z.object({ email: z.email().max(320) }),
  z.object({ domain: z.string().trim().toLowerCase().min(3).max(253) }),
]);
export type OptOutRequest = z.infer<typeof OptOutRequest>;

export const OptOutResponse = z.object({ ok: z.literal(true) });
export type OptOutResponse = z.infer<typeof OptOutResponse>;
