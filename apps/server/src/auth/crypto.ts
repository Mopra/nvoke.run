import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Prefix of desktop device tokens, so they are easy to tell apart from Clerk JWTs and to spot in leaks. */
export const DEVICE_TOKEN_PREFIX = 'nvk_dt_';
/** Prefix of one-time desktop auth codes. */
export const AUTH_CODE_PREFIX = 'nvk_ac_';

/** 32 random bytes as base64url, with a recognizable prefix. */
export function randomSecret(prefix: string): string {
  return prefix + randomBytes(32).toString('base64url');
}

/** Hex sha256. Secrets are stored only in this form. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** base64url(sha256(verifier)), the RFC 7636 S256 transform. */
export function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/** True when `verifier` hashes to `challenge` under S256. Constant time compare. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const expected = Buffer.from(s256Challenge(verifier));
  const actual = Buffer.from(challenge);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
