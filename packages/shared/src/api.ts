import { z } from 'zod';

/**
 * Wire contracts between apps/desktop, apps/site and apps/server. Every side
 * parses with these schemas, so a change here is a change to the API.
 */

export const HealthResponse = z.object({
  status: z.literal('ok'),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** The signed-in user as the server sees them, with profile fields from Clerk. */
export const MeResponse = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** How the request was authenticated: a desktop device token or a Clerk session. */
  via: z.enum(['device', 'clerk']),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const ApiError = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof ApiError>;

/**
 * Desktop sign-in (browser handoff with PKCE). See the "Desktop sign-in"
 * section in CLAUDE.md for the whole flow.
 */

/** base64url without padding, the alphabet used for state, challenge and verifier. */
const base64url = /^[A-Za-z0-9_-]+$/;

/** Opaque value the desktop app generates and checks on the callback. */
export const DesktopState = z.string().min(16).max(128).regex(base64url);

/** base64url(sha256(code_verifier)), always 43 characters. */
export const CodeChallenge = z.string().length(43).regex(base64url);

/** RFC 7636: 43 to 128 characters from the unreserved set. */
export const CodeVerifier = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);

export const DesktopAuthorizeRequest = z.object({
  state: DesktopState,
  code_challenge: CodeChallenge,
});
export type DesktopAuthorizeRequest = z.infer<typeof DesktopAuthorizeRequest>;

export const DesktopAuthorizeResponse = z.object({
  code: z.string(),
  expiresAt: z.string(),
});
export type DesktopAuthorizeResponse = z.infer<typeof DesktopAuthorizeResponse>;

export const DesktopTokenRequest = z.object({
  code: z.string().min(1).max(256),
  code_verifier: CodeVerifier,
  device_name: z.string().max(200).optional(),
});
export type DesktopTokenRequest = z.infer<typeof DesktopTokenRequest>;

export const DesktopTokenResponse = z.object({
  token: z.string(),
});
export type DesktopTokenResponse = z.infer<typeof DesktopTokenResponse>;
