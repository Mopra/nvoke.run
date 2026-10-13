import { z } from 'zod';

/**
 * API keys, agent sign-up and claiming. See "API and agents" in docs/SPEC.md.
 *
 * An API key (`nvk_sk_...`) authenticates the REST API and the MCP server as
 * its owner. Anyone signed in makes them; an agent gets its first one from
 * `POST /v1/agents/signup`, which creates the account without a human. The
 * person behind the email claims the account later from the link we mail.
 */

/** Prefix of API keys, so they are easy to recognize in code and in leaks. */
export const API_KEY_PREFIX = 'nvk_sk_';

/** How many live keys an account may hold. */
export const API_KEYS_MAX = 20;

export const ApiKeyOrigin = z.enum(['user', 'agent_signup']);
export type ApiKeyOrigin = z.infer<typeof ApiKeyOrigin>;

export const ApiKey = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The start of the key, for telling keys apart. The full key is shown once. */
  prefix: z.string(),
  /** `agent_signup`: the key an agent got when it created the account. */
  origin: ApiKeyOrigin,
  createdAt: z.iso.datetime({ offset: true }),
  lastUsedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ApiKey = z.infer<typeof ApiKey>;

export const ApiKeyListResponse = z.object({
  apiKeys: z.array(ApiKey),
});
export type ApiKeyListResponse = z.infer<typeof ApiKeyListResponse>;

export const CreateApiKeyRequest = z.object({
  name: z.string().trim().min(1).max(60),
});
export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>;

/** The new key with its secret. The secret is never returned again. */
export const CreateApiKeyResponse = ApiKey.extend({
  key: z.string().startsWith(API_KEY_PREFIX),
});
export type CreateApiKeyResponse = z.infer<typeof CreateApiKeyResponse>;

export const ApiKeyIdParams = z.object({
  id: z.uuid(),
});
export type ApiKeyIdParams = z.infer<typeof ApiKeyIdParams>;

/** Days an agent's account works before a human has to claim it. */
export const UNCLAIMED_ACTIVE_DAYS = 7;
/** Days after which an unclaimed account is deleted. */
export const UNCLAIMED_DELETE_DAYS = 30;

/**
 * `POST /v1/agents/signup` (public, rate limited): an agent creates an
 * account for the person it works for and gets an API key back at once.
 */
export const AgentSignupRequest = z.object({
  /** The human's email. They get one email: the link to claim the account. */
  email: z.email().max(320),
  /** What the agent calls itself, shown to the human in the claim email. */
  agentName: z.string().trim().min(1).max(60).optional(),
});
export type AgentSignupRequest = z.infer<typeof AgentSignupRequest>;

export const AgentSignupResponse = z.object({
  /** The API key. Send it as `Authorization: Bearer <apiKey>`. Shown once. */
  apiKey: z.string().startsWith(API_KEY_PREFIX),
  account: z.object({
    email: z.string(),
    status: z.literal('unclaimed'),
    /** False when the claim email could not be sent. The account works anyway. */
    claimEmailSent: z.boolean(),
    /** After this the key answers 403 `claim_required` until a human claims the account. */
    activeUntil: z.iso.datetime({ offset: true }),
  }),
  apiBase: z.string(),
  mcpUrl: z.string(),
  docsUrl: z.string(),
  nextSteps: z.array(z.string()),
});
export type AgentSignupResponse = z.infer<typeof AgentSignupResponse>;

/** Error codes of the sign-up route, in `{ error }`. */
export const AgentSignupErrorCode = z.enum([
  'invalid_request',
  /** An account with this email exists. Ask the human for an API key instead. */
  'account_exists',
  /** Disposable inbox, opted-out address, or a domain that takes no mail. */
  'email_not_accepted',
  /** Too many sign-ups from this address, domain or overall. Try again later. */
  'rate_limited',
  'signup_unavailable',
]);
export type AgentSignupErrorCode = z.infer<typeof AgentSignupErrorCode>;

/**
 * `POST /v1/agents/claim` (Clerk session, from the site's /claim page): the
 * human takes over an account an agent created and accepts the terms.
 */
export const ClaimRequest = z.object({
  acceptTerms: z.literal(true),
  /** False revokes the key the agent got at sign-up. */
  keepAgentKeys: z.boolean(),
});
export type ClaimRequest = z.infer<typeof ClaimRequest>;

/** Who created the account and whether a human has taken it over. In `GET /v1/me`. */
export const AccountOrigin = z.object({
  /** `agent`: created by `POST /v1/agents/signup`. */
  createdBy: z.enum(['human', 'agent']),
  /** The agent's name from sign-up, when an agent created it. */
  agentName: z.string().nullable(),
  /** Null while an agent-created account is unclaimed. Set for human accounts. */
  claimedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type AccountOrigin = z.infer<typeof AccountOrigin>;

export const ClaimResponse = z.object({
  account: AccountOrigin,
  /** Agent keys revoked by this claim. */
  revokedKeys: z.number().int().nonnegative(),
});
export type ClaimResponse = z.infer<typeof ClaimResponse>;
