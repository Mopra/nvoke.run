import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Pure helpers for the browser sign-in handshake. No Electron imports, so
 * they run under vitest.
 */

export const PROTOCOL = 'nvoke';
const CALLBACK_HOST = 'auth';
const CALLBACK_PATH = '/callback';

/** A browser sign-in that the app started and has not finished yet. */
export interface PendingAuth {
  state: string;
  codeVerifier: string;
  startedAt: number;
}

/** How long the app waits for the browser to come back. */
export const PENDING_TTL_MS = 10 * 60 * 1000;

export function createPendingAuth(now: number = Date.now()): PendingAuth {
  return {
    state: randomBytes(16).toString('base64url'),
    // 32 bytes as base64url is 43 characters, the RFC 7636 minimum.
    codeVerifier: randomBytes(32).toString('base64url'),
    startedAt: now,
  };
}

export function codeChallengeS256(codeVerifier: string): string {
  return createHash('sha256').update(codeVerifier, 'ascii').digest('base64url');
}

/** The site page that signs the user in and redirects back to nvoke://auth/callback. */
export function buildSignInUrl(siteUrl: string, pending: PendingAuth): string {
  const url = new URL('/desktop/sign-in', siteUrl);
  url.searchParams.set('state', pending.state);
  url.searchParams.set('code_challenge', codeChallengeS256(pending.codeVerifier));
  return url.toString();
}

/** Finds an nvoke:// URL in a process argv (Windows and Linux pass it there). */
export function findProtocolUrl(argv: readonly string[]): string | undefined {
  return argv.find((arg) => arg.toLowerCase().startsWith(`${PROTOCOL}://`));
}

export type CallbackResult = { ok: true; code: string } | { ok: false; error: string };

function sameString(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Validates an nvoke://auth/callback URL against the pending sign-in. The
 * state must match exactly, which ties the callback to this app instance and
 * this attempt.
 */
export function parseCallbackUrl(raw: string, pending: PendingAuth | null, now: number = Date.now()): CallbackResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: 'Malformed sign-in link.' };
  }
  if (url.protocol !== `${PROTOCOL}:` || url.hostname !== CALLBACK_HOST || url.pathname !== CALLBACK_PATH) {
    return { ok: false, error: 'Not a sign-in callback link.' };
  }
  if (!pending) {
    return { ok: false, error: 'No sign-in in progress. Start again from the app.' };
  }
  if (now - pending.startedAt > PENDING_TTL_MS) {
    return { ok: false, error: 'Sign-in timed out. Try again.' };
  }
  const state = url.searchParams.get('state');
  if (!state || !sameString(state, pending.state)) {
    return { ok: false, error: 'Sign-in didn’t match this app. Try again.' };
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return { ok: false, error: 'Sign-in wasn’t completed. Try again.' };
  }
  return { ok: true, code };
}
