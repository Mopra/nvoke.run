import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { s256Challenge, sha256Hex, verifyPkceS256 } from './crypto.js';
import { AUTH_CODE_TTL_MS, exchangeAuthCode, issueAuthCode, resolveDeviceToken } from './desktop.js';
import { memoryStore } from './store.js';

const verifier = () => randomBytes(32).toString('base64url');

describe('PKCE S256', () => {
  it('matches the RFC 7636 appendix B example', () => {
    const v = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(s256Challenge(v)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(verifyPkceS256(v, 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
  });

  it('rejects a different verifier or a malformed challenge', () => {
    const v = verifier();
    expect(verifyPkceS256(verifier(), s256Challenge(v))).toBe(false);
    expect(verifyPkceS256(v, 'short')).toBe(false);
  });
});

describe('desktop code exchange', () => {
  const user = 'user_123';

  it('exchanges a fresh code with the right verifier for a device token', async () => {
    const store = memoryStore();
    const v = verifier();
    const { code } = await issueAuthCode(store, { clerkUserId: user, codeChallenge: s256Challenge(v) });

    const result = await exchangeAuthCode(store, { code, codeVerifier: v, deviceName: 'laptop' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.token).toMatch(/^nvk_dt_[A-Za-z0-9_-]{43}$/);
    expect(result.session.clerkUserId).toBe(user);

    // Only hashes are stored.
    expect([...store.codes.keys()]).not.toContain(code);
    expect(store.sessions.has(sha256Hex(result.token))).toBe(true);
    expect([...store.sessions.keys()]).not.toContain(result.token);

    const session = await resolveDeviceToken(store, result.token);
    expect(session?.clerkUserId).toBe(user);
  });

  it('refuses a wrong verifier and burns the code', async () => {
    const store = memoryStore();
    const v = verifier();
    const { code } = await issueAuthCode(store, { clerkUserId: user, codeChallenge: s256Challenge(v) });

    expect(await exchangeAuthCode(store, { code, codeVerifier: verifier() })).toEqual({
      ok: false,
      reason: 'invalid_verifier',
    });
    // The right verifier no longer helps: the code is single use.
    expect(await exchangeAuthCode(store, { code, codeVerifier: v })).toEqual({ ok: false, reason: 'invalid_code' });
    expect(store.sessions.size).toBe(0);
  });

  it('is single use', async () => {
    const store = memoryStore();
    const v = verifier();
    const { code } = await issueAuthCode(store, { clerkUserId: user, codeChallenge: s256Challenge(v) });

    expect((await exchangeAuthCode(store, { code, codeVerifier: v })).ok).toBe(true);
    expect(await exchangeAuthCode(store, { code, codeVerifier: v })).toEqual({ ok: false, reason: 'invalid_code' });
    expect(store.sessions.size).toBe(1);
  });

  it('expires after five minutes', async () => {
    const store = memoryStore();
    const v = verifier();
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    const { code, expiresAt } = await issueAuthCode(
      store,
      { clerkUserId: user, codeChallenge: s256Challenge(v) },
      issuedAt,
    );
    expect(expiresAt.getTime() - issuedAt.getTime()).toBe(AUTH_CODE_TTL_MS);

    const late = new Date(issuedAt.getTime() + AUTH_CODE_TTL_MS + 1);
    expect(await exchangeAuthCode(store, { code, codeVerifier: v }, late)).toEqual({
      ok: false,
      reason: 'expired_code',
    });
  });

  it('still accepts a code just inside the window', async () => {
    const store = memoryStore();
    const v = verifier();
    const issuedAt = new Date('2026-01-01T00:00:00Z');
    const { code } = await issueAuthCode(store, { clerkUserId: user, codeChallenge: s256Challenge(v) }, issuedAt);
    const result = await exchangeAuthCode(store, { code, codeVerifier: v }, new Date(issuedAt.getTime() + AUTH_CODE_TTL_MS - 1));
    expect(result.ok).toBe(true);
  });

  it('refuses unknown codes', async () => {
    const store = memoryStore();
    expect(await exchangeAuthCode(store, { code: 'nvk_ac_nope', codeVerifier: verifier() })).toEqual({
      ok: false,
      reason: 'invalid_code',
    });
    expect(await exchangeAuthCode(store, { code: 'not-a-code', codeVerifier: verifier() })).toEqual({
      ok: false,
      reason: 'invalid_code',
    });
  });

  it('stops resolving a revoked device token', async () => {
    const store = memoryStore();
    const v = verifier();
    const { code } = await issueAuthCode(store, { clerkUserId: user, codeChallenge: s256Challenge(v) });
    const result = await exchangeAuthCode(store, { code, codeVerifier: v });
    if (!result.ok) throw new Error('exchange failed');

    await store.revokeDeviceSession(result.session.id);
    expect(await resolveDeviceToken(store, result.token)).toBeNull();
  });
});
