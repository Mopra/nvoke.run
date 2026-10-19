import { describe, expect, it, vi } from 'vitest';
import type { AuthState } from '../../ipc/contract';
import { codeChallengeS256 } from './flow';
import { AuthSession, type TokenStore } from './session';

const USER = { id: 'user_1', email: 'a@example.com', name: 'A', imageUrl: null };
const ME = {
  user: USER,
  via: 'device' as const,
  plan: 'free' as const,
  usage: { period: '2026-10', emailsVerified: 0, emailsLimit: 50 },
  maxSearchLimit: 1000,
  maxDropDailyLimit: 200,
  account: { createdBy: 'human' as const, agentName: null, claimedAt: '2026-10-01T00:00:00.000Z' },
  billingUrl: 'https://nvoke.run/desktop/billing',
};

function memoryTokenStore(initial: string | null = null): TokenStore & { value: string | null } {
  const store = {
    value: initial,
    load: async () => store.value,
    save: async (t: string) => {
      store.value = t;
    },
    clear: async () => {
      store.value = null;
    },
  };
  return store;
}

/** A fake apps/server that remembers the challenge from the sign-in URL. */
function setup(initialToken: string | null = null) {
  const tokenStore = memoryTokenStore(initialToken);
  const states: AuthState[] = [];
  let challenge = '';
  let state = '';
  const calls: { url: string; init?: RequestInit }[] = [];

  const fetchFake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith('/v1/desktop/token')) {
      const body = JSON.parse(String(init?.body)) as { code: string; code_verifier: string };
      if (body.code !== 'nvk_ac_good' || codeChallengeS256(body.code_verifier) !== challenge) {
        return Response.json({ error: 'invalid_code' }, { status: 400 });
      }
      return Response.json({ token: 'nvk_dt_secret' });
    }
    if (url.endsWith('/v1/me')) {
      const auth = new Headers(init?.headers).get('authorization');
      return auth === 'Bearer nvk_dt_secret' ? Response.json(ME) : Response.json({ error: 'nope' }, { status: 401 });
    }
    if (url.endsWith('/v1/desktop/sign-out')) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  });

  const session = new AuthSession({
    apiUrl: 'http://api.test',
    siteUrl: 'http://site.test',
    deviceName: 'test',
    tokenStore,
    openExternal: async (raw) => {
      const url = new URL(raw);
      challenge = url.searchParams.get('code_challenge') ?? '';
      state = url.searchParams.get('state') ?? '';
    },
    onChange: (s) => states.push(s),
    fetch: fetchFake as unknown as typeof fetch,
  });

  return { session, tokenStore, states, calls, getState: () => state };
}

describe('AuthSession', () => {
  it('signs in through the callback and keeps the token out of the state', async () => {
    const t = setup();
    await t.session.signIn();
    expect(t.session.getState()).toEqual({ status: 'pending' });

    const ok = await t.session.handleCallback(`nvoke://auth/callback?code=nvk_ac_good&state=${t.getState()}`);
    expect(ok).toBe(true);
    expect(t.tokenStore.value).toBe('nvk_dt_secret');
    expect(t.session.getState()).toEqual({ status: 'signed-in', user: USER });
    expect(JSON.stringify(t.states)).not.toContain('nvk_dt_secret');
  });

  it('refuses a callback with the wrong state and does not call the server', async () => {
    const t = setup();
    await t.session.signIn();
    const ok = await t.session.handleCallback('nvoke://auth/callback?code=nvk_ac_good&state=AAAAAAAAAAAAAAAAAAAAAA');
    expect(ok).toBe(false);
    expect(t.session.getState().status).toBe('signed-out');
    expect(t.calls).toHaveLength(0);
    expect(t.tokenStore.value).toBeNull();
  });

  it('accepts only one callback per attempt', async () => {
    const t = setup();
    await t.session.signIn();
    const url = `nvoke://auth/callback?code=nvk_ac_good&state=${t.getState()}`;
    expect(await t.session.handleCallback(url)).toBe(true);
    expect(await t.session.handleCallback(url)).toBe(false);
    // The stray second link does not sign the user out.
    expect(t.session.getState().status).toBe('signed-in');
  });

  it('reports a refused exchange', async () => {
    const t = setup();
    await t.session.signIn();
    expect(await t.session.handleCallback(`nvoke://auth/callback?code=nvk_ac_bad&state=${t.getState()}`)).toBe(false);
    const s = t.session.getState();
    expect(s.status === 'signed-out' && s.error).toMatch(/refused/);
  });

  it('restores a stored token and signs out', async () => {
    const t = setup('nvk_dt_secret');
    await t.session.init();
    expect(t.session.getState()).toEqual({ status: 'signed-in', user: USER });

    await t.session.signOut();
    expect(t.tokenStore.value).toBeNull();
    expect(t.session.getState()).toEqual({ status: 'signed-out' });
    const signOut = t.calls.find((c) => c.url.endsWith('/v1/desktop/sign-out'));
    expect(new Headers(signOut?.init?.headers).get('authorization')).toBe('Bearer nvk_dt_secret');
  });

  it('drops a revoked token on 401', async () => {
    const t = setup('nvk_dt_revoked');
    await t.session.init();
    expect(t.session.getState().status).toBe('signed-out');
    expect(t.tokenStore.value).toBeNull();
  });
});
