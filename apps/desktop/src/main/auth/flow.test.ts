import { describe, expect, it } from 'vitest';
import {
  PENDING_TTL_MS,
  buildSignInUrl,
  codeChallengeS256,
  createPendingAuth,
  findProtocolUrl,
  parseCallbackUrl,
} from './flow';

describe('desktop sign-in flow', () => {
  it('builds the site URL with state and an S256 challenge', () => {
    const pending = createPendingAuth();
    const url = new URL(buildSignInUrl('https://nvoke.run', pending));
    expect(url.origin + url.pathname).toBe('https://nvoke.run/desktop/sign-in');
    expect(url.searchParams.get('state')).toBe(pending.state);
    expect(url.searchParams.get('code_challenge')).toBe(codeChallengeS256(pending.codeVerifier));
    expect(url.searchParams.get('code_challenge')).toHaveLength(43);
    expect(pending.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it('matches the RFC 7636 S256 example', () => {
    expect(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('finds the callback URL in a second-instance argv', () => {
    const argv = ['C:\\nvoke\\nvoke.exe', '--allow-file-access', 'nvoke://auth/callback?code=x&state=y'];
    expect(findProtocolUrl(argv)).toBe('nvoke://auth/callback?code=x&state=y');
    expect(findProtocolUrl(['nvoke.exe'])).toBeUndefined();
  });

  it('accepts a callback with the right state', () => {
    const pending = createPendingAuth();
    const result = parseCallbackUrl(`nvoke://auth/callback?code=nvk_ac_abc&state=${pending.state}`, pending);
    expect(result).toEqual({ ok: true, code: 'nvk_ac_abc' });
  });

  it('rejects a wrong state', () => {
    const pending = createPendingAuth();
    const other = createPendingAuth();
    const result = parseCallbackUrl(`nvoke://auth/callback?code=nvk_ac_abc&state=${other.state}`, pending);
    expect(result.ok).toBe(false);
  });

  it('rejects a callback when no sign-in is pending', () => {
    const pending = createPendingAuth();
    expect(parseCallbackUrl(`nvoke://auth/callback?code=c&state=${pending.state}`, null).ok).toBe(false);
  });

  it('rejects a stale pending sign-in', () => {
    const pending = createPendingAuth(0);
    const url = `nvoke://auth/callback?code=c&state=${pending.state}`;
    expect(parseCallbackUrl(url, pending, PENDING_TTL_MS + 1).ok).toBe(false);
    expect(parseCallbackUrl(url, pending, PENDING_TTL_MS - 1).ok).toBe(true);
  });

  it('rejects other hosts, paths, schemes and a missing code', () => {
    const pending = createPendingAuth();
    const s = pending.state;
    expect(parseCallbackUrl(`nvoke://evil/callback?code=c&state=${s}`, pending).ok).toBe(false);
    expect(parseCallbackUrl(`nvoke://auth/other?code=c&state=${s}`, pending).ok).toBe(false);
    expect(parseCallbackUrl(`https://auth/callback?code=c&state=${s}`, pending).ok).toBe(false);
    expect(parseCallbackUrl(`nvoke://auth/callback?state=${s}`, pending).ok).toBe(false);
    expect(parseCallbackUrl('not a url', pending).ok).toBe(false);
  });
});
