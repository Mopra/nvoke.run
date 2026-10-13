// Agent sign-up: POST /v1/agents/signup creates an nvoke account without a
// human and hands the agent an API key at once (docs/SPEC.md, "API and agents").
//
// The Clerk user is created with its email `reserved`, not verified: the
// address cannot be taken by anyone else, but nobody has proven they own it.
// The owner gets one email with a sign-in ticket to /claim. Until a human
// claims it the account runs on the free plan, works for 7 days and is
// deleted after 30. A human signing in any other way claims it too and
// revokes the agent's key (Accounts.humanSignedIn), so an agent that used
// someone else's address loses access as soon as the owner shows up.

import { promises as dns } from 'node:dns';
import type { FastifyBaseLogger } from 'fastify';
import type { Sql } from 'postgres';
import {
  UNCLAIMED_ACTIVE_DAYS,
  UNCLAIMED_DELETE_DAYS,
  type AgentSignupErrorCode,
  type AgentSignupRequest,
  type AgentSignupResponse,
} from '@nvoke/shared';
import { createApiKey } from '../auth/api-keys.js';
import { sha256Hex } from '../auth/crypto.js';
import { isAddressSuppressed } from '../leads/suppression.js';
import { isDisposableDomain } from '../leads/verify/index.js';
import { isSharedMailDomain, parseAddress } from '../privacy/target.js';

/** Sign-up attempts allowed per window. Attempts count, not only successes, so the 409 cannot enumerate accounts. */
export const SIGNUP_LIMITS = {
  perIpPerHour: 3,
  /** Per email domain per day. Webmail domains are shared by strangers, so they get more room. */
  perDomainPerDay: 10,
  perWebmailDomainPerDay: 100,
  perDay: 300,
};

/** The Clerk side of sign-up. Clerk in production, a fake in tests. */
export interface AgentDirectory {
  emailTaken(email: string): Promise<boolean>;
  createUser(email: string): Promise<{ userId: string }>;
  deleteUser(userId: string): Promise<void>;
  /** A Clerk sign-in ticket the owner redeems on /claim. */
  claimTicket(userId: string, expiresInSeconds: number): Promise<string>;
}

export interface ClaimMailer {
  /** Never throws. True when the email was handed to the provider. */
  send(mail: { to: string; subject: string; text: string; idempotencyKey: string }): Promise<boolean>;
}

export interface SignupDeps {
  getSql: () => Sql;
  directory: AgentDirectory | null;
  mailer: ClaimMailer | null;
  log: FastifyBaseLogger;
  enabled: boolean;
  siteUrl: string;
  apiUrl: string;
  /** Resolves true when the domain has MX (or A) records and so can take mail. */
  receivesMail?: (domain: string) => Promise<boolean>;
  now?: () => Date;
}

export type SignupResult =
  | { ok: true; response: AgentSignupResponse }
  | { ok: false; status: number; error: AgentSignupErrorCode };

const fail = (status: number, error: AgentSignupErrorCode): SignupResult => ({ ok: false, status, error });

/** MX lookup with a short timeout. A null MX ("." ) means the domain takes no mail. */
export async function domainReceivesMail(domain: string): Promise<boolean> {
  const lookup = async () => {
    try {
      const mx = await dns.resolveMx(domain);
      return mx.some((r) => r.exchange !== '' && r.exchange !== '.');
    } catch (err) {
      const code = (err as { code?: string }).code;
      // No MX at all: mail falls back to the A record (RFC 5321).
      if (code === 'ENODATA') return (await dns.resolve4(domain).catch(() => [])).length > 0;
      if (code === 'ENOTFOUND') return false;
      return true; // A resolver hiccup is not the caller's fault.
    }
  };
  return Promise.race([lookup(), new Promise<boolean>((r) => setTimeout(() => r(true), 5_000))]);
}

export async function agentSignup(deps: SignupDeps, input: AgentSignupRequest, ip: string): Promise<SignupResult> {
  if (!deps.enabled || !deps.directory) return fail(503, 'signup_unavailable');
  const now = deps.now?.() ?? new Date();

  const email = parseAddress(input.email);
  if (!email) return fail(400, 'invalid_request');
  const domain = email.slice(email.lastIndexOf('@') + 1);
  if (isDisposableDomain(domain)) return fail(422, 'email_not_accepted');

  const sql = deps.getSql();
  const ipHash = sha256Hex(`agent-signup:${ip}`);
  const [counts] = await sql<{ ip: number; domain: number; total: number }[]>`
    select
      count(*) filter (where ip_hash = ${ipHash} and created_at > now() - interval '1 hour')::int as ip,
      count(*) filter (where email_domain = ${domain})::int as domain,
      count(*)::int as total
    from agent_signups where created_at > now() - interval '1 day'
  `;
  const perDomain = isSharedMailDomain(domain) ? SIGNUP_LIMITS.perWebmailDomainPerDay : SIGNUP_LIMITS.perDomainPerDay;
  if (counts!.ip >= SIGNUP_LIMITS.perIpPerHour || counts!.domain >= perDomain || counts!.total >= SIGNUP_LIMITS.perDay) {
    deps.log.warn({ domain, counts }, 'agent sign-up rate limited');
    return fail(429, 'rate_limited');
  }
  const [attempt] = await sql<{ id: string }[]>`
    insert into agent_signups (ip_hash, email_domain) values (${ipHash}, ${domain}) returning id
  `;

  // Someone who opted out of nvoke never hears from us again, not even here.
  if (await isAddressSuppressed(sql, email)) return fail(422, 'email_not_accepted');
  if (!(await (deps.receivesMail ?? domainReceivesMail)(domain))) return fail(422, 'email_not_accepted');
  if (await deps.directory.emailTaken(email)) return fail(409, 'account_exists');

  const { userId } = await deps.directory.createUser(email);
  const agentName = input.agentName ?? null;
  let apiKey: string;
  try {
    apiKey = await sql.begin(async (tx) => {
      await tx`
        insert into accounts (clerk_user_id, created_by, agent_name, claimed_at)
        values (${userId}, 'agent', ${agentName}, null)
      `;
      const key = await createApiKey(tx, userId, { name: agentName ? `${agentName} (sign-up)` : 'Agent sign-up', origin: 'agent_signup' });
      await tx`update agent_signups set clerk_user_id = ${userId} where id = ${attempt!.id}`;
      return key!.key;
    });
  } catch (err) {
    // Leave no Clerk user behind that our database does not know.
    await deps.directory.deleteUser(userId).catch((e: unknown) => deps.log.error({ err: e, userId }, 'agent sign-up: could not delete clerk user'));
    throw err;
  }

  let claimEmailSent = false;
  try {
    const ticket = await deps.directory.claimTicket(userId, UNCLAIMED_DELETE_DAYS * 86_400);
    const link = `${new URL('/claim', deps.siteUrl).toString()}#ticket=${encodeURIComponent(ticket)}`;
    claimEmailSent =
      (await deps.mailer?.send({
        to: email,
        subject: 'Claim your nvoke account',
        text: claimEmailText({ agentName, link, siteUrl: deps.siteUrl }),
        idempotencyKey: `nvoke-claim:${userId}`,
      })) ?? false;
  } catch (err) {
    deps.log.error({ err, userId }, 'agent sign-up: claim email failed');
  }
  deps.log.info({ userId, domain, agentName, claimEmailSent }, 'agent signed up');

  const apiBase = new URL('/v1', deps.apiUrl).toString();
  const mcpUrl = new URL('/mcp', deps.apiUrl).toString();
  const activeUntil = new Date(now.getTime() + UNCLAIMED_ACTIVE_DAYS * 86_400_000).toISOString();
  return {
    ok: true,
    response: {
      apiKey,
      account: { email, status: 'unclaimed', claimEmailSent, activeUntil },
      apiBase,
      mcpUrl,
      docsUrl: new URL('/docs', deps.siteUrl).toString(),
      nextSteps: [
        `Store the API key now. It is shown once. Send it as "Authorization: Bearer <apiKey>".`,
        `Check the account: GET ${apiBase}/me`,
        `Start a search: POST ${apiBase}/searches with {"kind":"local","params":{"niche":"dentists","location":"Aarhus"}}`,
        `Or connect over MCP: ${mcpUrl} with the same bearer key.`,
        `Tell your human to open the email we sent to ${email} and claim the account within ${UNCLAIMED_ACTIVE_DAYS} days, or the key stops working.`,
      ],
    },
  };
}

export function claimEmailText(opts: { agentName: string | null; link: string; siteUrl: string }): string {
  const who = opts.agentName ? `An AI agent called "${opts.agentName}"` : 'An AI agent';
  return [
    `${who} signed you up for nvoke with this address.`,
    '',
    'nvoke finds companies and checks their email addresses. The agent has an API key on the free plan: 50 verified emails a month.',
    '',
    `Claim the account: ${opts.link}`,
    '',
    'Claiming signs you in, shows what the agent did, and lets you keep or revoke its key.',
    '',
    `Not you? Ignore this email. The key stops working in ${UNCLAIMED_ACTIVE_DAYS} days and the account is deleted after ${UNCLAIMED_DELETE_DAYS}. We will not write to this address again.`,
    '',
    `nvoke, ${opts.siteUrl}`,
  ].join('\n');
}
