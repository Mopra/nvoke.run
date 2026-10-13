import { AUTH_CODE_PREFIX, DEVICE_TOKEN_PREFIX, randomSecret, sha256Hex, verifyPkceS256 } from './crypto.js';
import type { DesktopAuthStore, DeviceSessionRow } from './store.js';

/** How long a one-time code from /v1/desktop/authorize stays redeemable. */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000;

/** Mints a one-time code for a signed-in Clerk user, bound to the desktop's PKCE challenge. */
export async function issueAuthCode(
  store: DesktopAuthStore,
  input: { clerkUserId: string; codeChallenge: string },
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  const code = randomSecret(AUTH_CODE_PREFIX);
  const expiresAt = new Date(now.getTime() + AUTH_CODE_TTL_MS);
  await store.insertCode(sha256Hex(code), {
    clerkUserId: input.clerkUserId,
    codeChallenge: input.codeChallenge,
    expiresAt,
  });
  return { code, expiresAt };
}

export type ExchangeResult =
  | { ok: true; token: string; session: DeviceSessionRow }
  | { ok: false; reason: 'invalid_code' | 'expired_code' | 'invalid_verifier' };

/**
 * Redeems a one-time code for a long lived device token. The code is burned
 * on the first attempt whatever the outcome, so a leaked code cannot be
 * retried with guessed verifiers.
 */
export async function exchangeAuthCode(
  store: DesktopAuthStore,
  input: { code: string; codeVerifier: string; deviceName?: string | null; userAgent?: string | null },
  now: Date = new Date(),
): Promise<ExchangeResult> {
  if (!input.code.startsWith(AUTH_CODE_PREFIX)) return { ok: false, reason: 'invalid_code' };
  const row = await store.consumeCode(sha256Hex(input.code));
  if (!row) return { ok: false, reason: 'invalid_code' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired_code' };
  if (!verifyPkceS256(input.codeVerifier, row.codeChallenge)) return { ok: false, reason: 'invalid_verifier' };

  const token = randomSecret(DEVICE_TOKEN_PREFIX);
  const session = await store.insertDeviceSession(sha256Hex(token), {
    clerkUserId: row.clerkUserId,
    deviceName: input.deviceName ?? null,
    userAgent: input.userAgent ?? null,
  });
  return { ok: true, token, session };
}

/** True for strings shaped like our device tokens (as opposed to Clerk JWTs). */
export function isDeviceToken(token: string): boolean {
  return token.startsWith(DEVICE_TOKEN_PREFIX);
}

/** Resolves a device token to its live session, or null when unknown or revoked. */
export async function resolveDeviceToken(store: DesktopAuthStore, token: string): Promise<DeviceSessionRow | null> {
  if (!isDeviceToken(token)) return null;
  return store.touchDeviceSession(sha256Hex(token));
}
