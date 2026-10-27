// Sign in with Microsoft for a mailbox (docs/sending/plan.md, "Step 2").
// Microsoft 365 and Outlook.com no longer take a password over SMTP or
// IMAP, so the mailbox signs in once through Microsoft and we keep its
// tokens: the access token goes to SMTP and IMAP as XOAUTH2, so the
// transport stays the same. The tokens are sealed in mailboxes.secret as
// JSON and refreshed here when the access token is about to run out.
//
// The app registration is multi tenant and takes personal accounts too
// (the `common` authority), with delegated scopes only.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Sql, TransactionSql } from 'postgres';
import type { Secrets } from '../crypto/secrets.js';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
export const MICROSOFT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'https://outlook.office.com/SMTP.Send',
  'https://outlook.office.com/IMAP.AccessAsUser.All',
];
/** Microsoft's SMTP and IMAP servers; Outlook.com mailboxes use the same ones. */
export const MICROSOFT_SERVERS = { smtpHost: 'smtp.office365.com', smtpPort: 587, imapHost: 'outlook.office365.com', imapPort: 993 };
/** A sign-in must come back within this long of its start. */
const STATE_TTL_MS = 15 * 60_000;
/** Refresh this long before the access token runs out, so a slow send does not outlive it. */
const REFRESH_EARLY_MS = 5 * 60_000;

export interface MicrosoftOAuth {
  clientId: string;
  clientSecret: string;
  /** The site's callback page, registered on the app. */
  redirectUri: string;
  /** Tests pass their own. */
  fetch?: typeof fetch;
}

/** The app from the environment, or null when it is not set up. */
export function microsoftOAuthFrom(env: { MICROSOFT_MAIL_CLIENT_ID?: string; MICROSOFT_MAIL_CLIENT_SECRET?: string; SITE_URL: string }): MicrosoftOAuth | null {
  if (!env.MICROSOFT_MAIL_CLIENT_ID || !env.MICROSOFT_MAIL_CLIENT_SECRET) return null;
  return {
    clientId: env.MICROSOFT_MAIL_CLIENT_ID,
    clientSecret: env.MICROSOFT_MAIL_CLIENT_SECRET,
    redirectUri: new URL('/app/mailboxes/callback', env.SITE_URL).toString(),
  };
}

/** What mailboxes.secret holds for a Microsoft mailbox, sealed. */
export interface OAuthTokens {
  provider: 'microsoft';
  refreshToken: string;
  accessToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/**
 * The sign-in no longer works: revoked, expired or the password changed.
 * Shaped like a refused login, so the transport's callers pause the mailbox.
 */
export class OAuthError extends Error {
  readonly code = 'EAUTH';
  readonly authenticationFailed = true;
  constructor(message = SIGN_IN_AGAIN) {
    super(message);
    this.name = 'OAuthError';
  }
}
/** Our own words, so checkReason can tell an ended sign-in from a refused one. */
export const SIGN_IN_AGAIN = 'microsoft sign-in ended';
/** Microsoft refused nvoke's app itself (an expired client secret, say): every Microsoft mailbox pauses until it is fixed. */
export const APP_REFUSED = 'microsoft refused the nvoke app';

const stateMac = (secrets: Secrets, userId: string, nonce: string, expires: string) =>
  createHmac('sha256', secrets.derive('mailbox-oauth')).update(`${userId}.${nonce}.${expires}`).digest().subarray(0, 16);

/** A state bound to the user and good for 15 minutes, so a callback cannot be replayed into another account. */
export function signState(secrets: Secrets, userId: string, now: Date = new Date()): string {
  const nonce = randomBytes(12).toString('base64url');
  const expires = String(now.getTime() + STATE_TTL_MS);
  return `${nonce}.${expires}.${stateMac(secrets, userId, nonce, expires).toString('base64url')}`;
}

export function checkState(secrets: Secrets, userId: string, state: string, now: Date = new Date()): boolean {
  const [nonce, expires, mac] = state.split('.');
  if (!nonce || !expires || !mac || !/^\d+$/.test(expires) || Number(expires) < now.getTime()) return false;
  const given = Buffer.from(mac, 'base64url');
  const want = stateMac(secrets, userId, nonce, expires);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * The PKCE verifier for a sign-in, derived from its state, so nothing is
 * stored between start and callback and a stolen code is useless without it.
 */
export function pkceVerifier(secrets: Secrets, state: string): string {
  return createHmac('sha256', secrets.derive('mailbox-pkce')).update(state).digest().toString('base64url');
}

export function authorizeUrl(cfg: MicrosoftOAuth, state: string, verifier: string): string {
  const url = new URL(`${AUTHORITY}/authorize`);
  url.search = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    response_mode: 'query',
    redirect_uri: cfg.redirectUri,
    scope: MICROSOFT_SCOPES.join(' '),
    state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(
  cfg: MicrosoftOAuth,
  params: Record<string, string>,
  now: Date,
  oldRefreshToken?: string,
): Promise<{ tokens: OAuthTokens; idToken?: string }> {
  const res = await (cfg.fetch ?? fetch)(`${AUTHORITY}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: MICROSOFT_SCOPES.join(' '), ...params }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  // invalid_grant and interaction_required: the user must sign in again.
  // invalid_client and unauthorized_client: our app is refused. Anything else may pass.
  if (body.error === 'invalid_grant' || body.error === 'interaction_required') throw new OAuthError();
  if (body.error === 'invalid_client' || body.error === 'unauthorized_client') throw new OAuthError(APP_REFUSED);
  // A refresh may come back without a new refresh token: the old one still holds.
  const refreshToken = body.refresh_token ?? oldRefreshToken;
  if (!res.ok || !body.access_token || !refreshToken) {
    throw new Error(`microsoft token endpoint: ${res.status} ${body.error ?? ''}`.trim());
  }
  return {
    tokens: {
      provider: 'microsoft',
      accessToken: body.access_token,
      refreshToken,
      expiresAt: now.getTime() + (body.expires_in ?? 3600) * 1000,
    },
    idToken: body.id_token,
  };
}

export interface MicrosoftIdentity {
  /** The address mail goes out from. */
  address: string;
  /** The sign-in name, for XOAUTH2. Usually the address. */
  username: string;
  displayName: string;
}

/**
 * The id token's claims. It comes straight from the token endpoint over
 * TLS, so its signature needs no check (OpenID Connect Core 3.1.3.7).
 */
export function identityFrom(idToken: string | undefined): MicrosoftIdentity | null {
  const payload = idToken?.split('.')[1];
  if (!payload) return null;
  let claims: { email?: string; preferred_username?: string; name?: string };
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as typeof claims;
  } catch {
    return null;
  }
  const username = claims.preferred_username?.trim().toLowerCase();
  const address = (claims.email?.trim() || username)?.toLowerCase();
  if (!username || !address || !address.includes('@')) return null;
  return { address, username, displayName: claims.name?.trim() || address.split('@')[0]! };
}

/** Trades the callback's code for tokens and who signed in. Throws OAuthError on a refused code. */
export async function exchangeCode(
  cfg: MicrosoftOAuth,
  code: string,
  verifier: string,
  now: Date = new Date(),
): Promise<{ tokens: OAuthTokens; identity: MicrosoftIdentity }> {
  const params = { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri, code_verifier: verifier };
  const { tokens, idToken } = await tokenRequest(cfg, params, now);
  const identity = identityFrom(idToken);
  if (!identity) throw new OAuthError('microsoft did not say which mailbox signed in');
  return { tokens, identity };
}

export async function refreshTokens(cfg: MicrosoftOAuth, refreshToken: string, now: Date = new Date()): Promise<OAuthTokens> {
  return (await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken }, now, refreshToken)).tokens;
}

export function openTokens(secrets: Secrets, sealed: string): OAuthTokens {
  return JSON.parse(secrets.open(sealed)) as OAuthTokens;
}

/**
 * The transport's token source for one mailbox: the saved access token
 * while it lasts, else a refresh, saved before use (Microsoft may hand out
 * a new refresh token). Opens the sealed tokens at once, so a changed
 * SECRETS_KEY throws here. The save only replaces the secret it read, so a
 * new sign-in in between is never overwritten. Without the app's config
 * the mailbox cannot sign in, and pauses like a refused app.
 */
export function tokenSource(
  deps: { sql: Sql | TransactionSql; secrets: Secrets; microsoft?: MicrosoftOAuth | null; now?: () => Date },
  mailboxId: string,
  sealed: string,
): () => Promise<string> {
  let current = openTokens(deps.secrets, sealed);
  let saved = sealed;
  return async () => {
    const now = deps.now?.() ?? new Date();
    if (current.expiresAt - REFRESH_EARLY_MS > now.getTime()) return current.accessToken;
    if (!deps.microsoft) throw new OAuthError(APP_REFUSED);
    current = await refreshTokens(deps.microsoft, current.refreshToken, now);
    const next = deps.secrets.seal(JSON.stringify(current));
    await deps.sql`update mailboxes set secret = ${next} where id = ${mailboxId} and secret = ${saved}`;
    saved = next;
    return current.accessToken;
  };
}
