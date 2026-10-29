// The Agents group of the catalog: its endpoints and its error codes.

import { AgentSignupRequest, AgentSignupResponse, ClaimRequest, ClaimResponse, ClaimStatusResponse } from '../agents.ts';
import type { Endpoint } from './types.ts';

export const agentEndpoints: Endpoint[] = [
  {
    id: 'agentSignup',
    method: 'POST',
    path: '/v1/agents/signup',
    group: 'Agents',
    summary: 'Sign up as an agent',
    description:
      'Creates an nvoke account for the person you work for and returns an API key at once. No browser, no human needed. The free plan applies: 50 verified emails a month. We send that person one email with a link to claim the account. Unclaimed accounts work for 7 days, then answer 403 `claim_required` until claimed, and are deleted after 30 days. Rate limited per IP, per email domain and per day.',
    auth: 'public',
    body: AgentSignupRequest,
    status: 201,
    response: AgentSignupResponse,
    errors: ['invalid_request', 'account_exists', 'email_not_accepted', 'rate_limited', 'signup_unavailable'],
    example: { email: 'ada@example.com', agentName: 'Claude' },
  },
  {
    id: 'getClaim',
    method: 'GET',
    path: '/v1/agents/claim',
    group: 'Agents',
    summary: 'Read an account before claiming it',
    description: 'Called by the claim page on nvoke.run: who created the account and whether it is claimed. Unlike every other signed-in request, it does not claim the account.',
    auth: 'session',
    status: 200,
    response: ClaimStatusResponse,
    errors: [],
  },
  {
    id: 'claimAccount',
    method: 'POST',
    path: '/v1/agents/claim',
    group: 'Agents',
    summary: 'Claim an account an agent created',
    description: 'Called by the claim page on nvoke.run after the human signs in from the emailed link. Accepts the terms and keeps or revokes the agent’s key.',
    auth: 'session',
    body: ClaimRequest,
    status: 200,
    response: ClaimResponse,
    errors: ['invalid_request'],
  },
];

/** An agent made the account and nobody claimed it. */
export const agentClaimErrors: Record<string, string> = {
  claim_required: 'An agent created this account more than 7 days ago and nobody claimed it. The human claims it from the emailed link.',
};

/** Agent sign-up refused the email. */
export const agentSignupErrors: Record<string, string> = {
  account_exists: 'An account with this email exists. Ask the human for an API key.',
  email_not_accepted: 'Disposable inbox, an opted-out address, or a domain that receives no mail.',
};

/** Agent sign-up is off. */
export const agentSwitchErrors: Record<string, string> = {
  signup_unavailable: 'Agent sign-up is switched off right now.',
};
