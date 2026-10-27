import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { describe, expect, it } from 'vitest';
import { createSecrets } from '../crypto/secrets.js';
import {
  ADMIN_CONSENT,
  adminConsentUrl,
  needsAdminConsent,
  APP_REFUSED,
  authorizeUrl,
  checkState,
  exchangeCode,
  identityFrom,
  microsoftOAuthFrom,
  OAuthError,
  openTokens,
  pkceVerifier,
  refreshTokens,
  SIGN_IN_AGAIN,
  signState,
  tokenSource,
  type MicrosoftOAuth,
  type OAuthTokens,
} from './oauth.js';

const secrets = createSecrets(randomBytes(32).toString('base64'));
const NOW = new Date('2026-10-27T10:00:00Z');

const idToken = (claims: Record<string, unknown>) =>
  ['e30', Buffer.from(JSON.stringify(claims)).toString('base64url'), 'sig'].join('.');

/** A token endpoint that answers each request with the next scripted body, and keeps what it was sent. */
function tokenEndpoint(answers: { status?: number; body: Record<string, unknown> }[]) {
  const sent: URLSearchParams[] = [];
  const fetch = (async (_url: string, init: RequestInit) => {
    sent.push(new URLSearchParams(init.body as URLSearchParams));
    const a = answers.shift()!;
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as unknown as typeof globalThis.fetch;
  return { sent, fetch };
}

const cfg = (fetch?: typeof globalThis.fetch): MicrosoftOAuth => ({
  clientId: 'client-1',
  clientSecret: 'shh',
  redirectUri: 'https://nvoke.run/app/mailboxes/callback',
  fetch,
});

describe('state', () => {
  it('holds for the user who started, until it expires', () => {
    const state = signState(secrets, 'u1', NOW);
    expect(checkState(secrets, 'u1', state, NOW)).toBe(true);
    expect(checkState(secrets, 'u2', state, NOW)).toBe(false);
    expect(checkState(secrets, 'u1', state, new Date(NOW.getTime() + 16 * 60_000))).toBe(false);
    expect(checkState(secrets, 'u1', state.replace(/\.\d+\./, `.${NOW.getTime() + 3_600_000}.`), NOW)).toBe(false);
    expect(checkState(secrets, 'u1', 'nonsense', NOW)).toBe(false);
  });
});

describe('sign in', () => {
  it('sends the browser to Microsoft with the mail scopes and our callback', () => {
    const url = new URL(authorizeUrl(cfg(), 'st', pkceVerifier(secrets, 'st')));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(url.origin + url.pathname).toBe('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    expect(url.searchParams.get('redirect_uri')).toBe('https://nvoke.run/app/mailboxes/callback');
    expect(url.searchParams.get('scope')).toContain('https://outlook.office.com/SMTP.Send');
    expect(url.searchParams.get('scope')).toContain('offline_access');
    expect(url.searchParams.get('state')).toBe('st');
  });

  it('trades the code for tokens and reads who signed in', async () => {
    const endpoint = tokenEndpoint([
      { body: { access_token: 'at', refresh_token: 'rt', expires_in: 3600, id_token: idToken({ preferred_username: 'Mia@Acme.io', name: 'Mia Acme' }) } },
    ]);
    const got = await exchangeCode(cfg(endpoint.fetch), 'the-code', 'the-verifier', NOW);
    expect(got.tokens).toEqual({ provider: 'microsoft', accessToken: 'at', refreshToken: 'rt', expiresAt: NOW.getTime() + 3_600_000 });
    expect(got.identity).toEqual({ address: 'mia@acme.io', username: 'mia@acme.io', displayName: 'Mia Acme' });
    expect(endpoint.sent[0]!.get('grant_type')).toBe('authorization_code');
    expect(endpoint.sent[0]!.get('code')).toBe('the-code');
    expect(endpoint.sent[0]!.get('client_secret')).toBe('shh');
    expect(endpoint.sent[0]!.get('code_verifier')).toBe('the-verifier');
  });

  it('prefers the email claim and refuses a token without an address', () => {
    expect(identityFrom(idToken({ preferred_username: 'mia@acme.onmicrosoft.com', email: 'mia@acme.io' }))).toMatchObject({
      address: 'mia@acme.io',
      username: 'mia@acme.onmicrosoft.com',
      displayName: 'mia',
    });
    expect(identityFrom(idToken({ name: 'No One' }))).toBeNull();
    expect(identityFrom(undefined)).toBeNull();
  });

  it('calls a refused grant an ended sign-in, a refused app its own, and anything else an error to try again', async () => {
    await expect(refreshTokens(cfg(tokenEndpoint([{ status: 400, body: { error: 'invalid_grant' } }]).fetch), 'rt', NOW)).rejects.toMatchObject({ message: SIGN_IN_AGAIN });
    await expect(refreshTokens(cfg(tokenEndpoint([{ status: 401, body: { error: 'invalid_client' } }]).fetch), 'rt', NOW)).rejects.toMatchObject({ message: APP_REFUSED });
    const other = await refreshTokens(cfg(tokenEndpoint([{ status: 503, body: {} }]).fetch), 'rt', NOW).catch((e: unknown) => e);
    expect(other).toBeInstanceOf(Error);
    expect(other).not.toBeInstanceOf(OAuthError);
  });

  it('tells a missing admin consent from an ended sign-in', async () => {
    const consent = { error: 'invalid_grant', error_description: 'AADSTS65001: The user or administrator has not consented to use the application.' };
    await expect(refreshTokens(cfg(tokenEndpoint([{ status: 400, body: consent }]).fetch), 'rt', NOW)).rejects.toMatchObject({ message: ADMIN_CONSENT });
    expect(needsAdminConsent('access_denied', 'AADSTS90094: The grant requires admin permission.')).toBe(true);
    expect(needsAdminConsent('access_denied', 'AADSTS65004: User declined to consent.')).toBe(false);
    expect(needsAdminConsent('consent_required', null)).toBe(true);
  });

  it('builds the admin consent link for organizations with the mail scopes', () => {
    const url = new URL(adminConsentUrl(cfg()));
    expect(url.pathname).toBe('/organizations/v2.0/adminconsent');
    expect(url.searchParams.get('scope')).toBe('https://outlook.office.com/SMTP.Send https://outlook.office.com/IMAP.AccessAsUser.All');
    expect(url.searchParams.get('redirect_uri')).toBe(cfg().redirectUri);
  });
});

describe('token source', () => {
  const tokens = (expiresAt: number): OAuthTokens => ({ provider: 'microsoft', accessToken: 'old', refreshToken: 'rt-1', expiresAt });

  /** Stands in for postgres.js: keeps the new sealed secret and the one it replaces. */
  function fakeSql() {
    const saved: string[] = [];
    const replaced: string[] = [];
    const sql = ((_strings: TemplateStringsArray, ...values: unknown[]) => {
      saved.push(values[0] as string);
      replaced.push(values[2] as string);
      return Promise.resolve([]);
    }) as unknown as Sql;
    return { sql, saved, replaced };
  }
  const seal = (t: OAuthTokens) => secrets.seal(JSON.stringify(t));

  it('keeps the old refresh token when a refresh hands out none, and pauses without the app', async () => {
    const { sql, saved } = fakeSql();
    const endpoint = tokenEndpoint([{ body: { access_token: 'new', expires_in: 3600 } }]);
    const stale = seal(tokens(NOW.getTime()));
    expect(await tokenSource({ sql, secrets, microsoft: cfg(endpoint.fetch), now: () => NOW }, 'mb-1', stale)()).toBe('new');
    expect(openTokens(secrets, saved[0]!).refreshToken).toBe('rt-1');
    await expect(tokenSource({ sql, secrets, microsoft: null, now: () => NOW }, 'mb-1', stale)()).rejects.toMatchObject({ message: APP_REFUSED });
  });

  it('hands out the saved token while it lasts', async () => {
    const { sql, saved } = fakeSql();
    const get = tokenSource({ sql, secrets, microsoft: cfg(), now: () => NOW }, 'mb-1', seal(tokens(NOW.getTime() + 30 * 60_000)));
    expect(await get()).toBe('old');
    expect(saved).toEqual([]);
  });

  it('refreshes a token about to run out and saves the new ones over the old, first', async () => {
    const { sql, saved, replaced } = fakeSql();
    const endpoint = tokenEndpoint([{ body: { access_token: 'new', refresh_token: 'rt-2', expires_in: 3600 } }]);
    const old = seal(tokens(NOW.getTime() + 60_000));
    const get = tokenSource({ sql, secrets, microsoft: cfg(endpoint.fetch), now: () => NOW }, 'mb-1', old);
    expect(await get()).toBe('new');
    expect(endpoint.sent[0]!.get('refresh_token')).toBe('rt-1');
    expect(openTokens(secrets, saved[0]!)).toMatchObject({ accessToken: 'new', refreshToken: 'rt-2' });
    expect(replaced[0]).toBe(old);
    // The new token lasts, so a second call does not refresh again.
    expect(await get()).toBe('new');
    expect(endpoint.sent).toHaveLength(1);
  });
});

it('reads the app from the environment, or none', () => {
  expect(microsoftOAuthFrom({ SITE_URL: 'https://nvoke.run' })).toBeNull();
  expect(microsoftOAuthFrom({ MICROSOFT_MAIL_CLIENT_ID: 'id', MICROSOFT_MAIL_CLIENT_SECRET: 's', SITE_URL: 'http://localhost:3001' })).toMatchObject({
    redirectUri: 'http://localhost:3001/app/mailboxes/callback',
  });
});
