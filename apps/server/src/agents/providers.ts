// Production collaborators of agent sign-up: Clerk for the user, Day3 for the
// claim email. Tests use fakes with the same interfaces (signup.ts).

import { createClerkClient } from '@clerk/backend';
import type { FastifyBaseLogger } from 'fastify';
import { DAY3_EMAILS_URL } from '../alerts.js';
import type { FetchLike } from '../leads/http.js';
import type { AgentDirectory, ClaimMailer } from './signup.js';

export function clerkAgentDirectory(secretKey: string): AgentDirectory {
  const clerk = createClerkClient({ secretKey });
  return {
    async emailTaken(email) {
      const users = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
      return users.totalCount > 0;
    },
    async createUser(email) {
      const user = await clerk.users.createUser({
        emailAddress: [email],
        // Reserved: unverified, but nobody else can take the address.
        emailAddressIdentificationStatus: ['reserved'],
        skipPasswordRequirement: true,
        // The human accepts the terms when claiming (POST /v1/agents/claim).
        skipLegalChecks: true,
        publicMetadata: { createdBy: 'agent' },
      });
      return { userId: user.id };
    },
    async deleteUser(userId) {
      await clerk.users.deleteUser(userId);
    },
    async claimTicket(userId, expiresInSeconds) {
      const token = await clerk.signInTokens.createSignInToken({ userId, expiresInSeconds });
      return token.token;
    },
  };
}

export function day3ClaimMailer(opts: { apiKey: string; from: string; log: FastifyBaseLogger; fetch?: FetchLike }): ClaimMailer {
  const doFetch = opts.fetch ?? fetch;
  return {
    async send(mail) {
      try {
        const res = await doFetch(DAY3_EMAILS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': mail.idempotencyKey,
          },
          body: JSON.stringify({ from: opts.from, to: [mail.to], subject: mail.subject, text: mail.text }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          opts.log.error({ status: res.status, body: (await res.text()).slice(0, 300) }, 'claim email failed');
          return false;
        }
        return true;
      } catch (err) {
        opts.log.error({ err }, 'claim email could not be sent');
        return false;
      }
    },
  };
}
