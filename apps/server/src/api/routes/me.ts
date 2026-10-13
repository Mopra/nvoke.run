import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@nvoke/shared';
import type { UserDirectory, UserProfile } from '../../auth/users.js';
import type { Accounts } from '../../leads/accounts.js';

/** `?sync=1` re-reads the plan from Clerk Billing, for right after a checkout. */
function wantsSync(query: unknown): boolean {
  const sync = (query as { sync?: unknown } | undefined)?.sync;
  return sync === '1' || sync === 'true';
}

export async function meRoutes(
  app: FastifyInstance,
  opts: { users: UserDirectory | null; accounts: Accounts },
): Promise<void> {
  app.get('/me', { preHandler: app.requireAuth }, async (req): Promise<MeResponse> => {
    // requireAuth has either set req.auth or already replied.
    const auth = req.auth!;
    const lookup = async (): Promise<UserProfile> => {
      const none = { email: null, name: null, imageUrl: null };
      if (!opts.users) return none;
      try {
        return await opts.users.getProfile(auth.userId);
      } catch (err) {
        // The user is authenticated either way; profile fields are best effort.
        req.log.warn({ err }, 'clerk user lookup failed');
        return none;
      }
    };
    const [profile, account] = await Promise.all([lookup(), opts.accounts.summary(auth.userId, { sync: wantsSync(req.query) })]);
    return {
      user: { id: auth.userId, ...profile },
      via: auth.via,
      plan: account.plan,
      usage: account.usage,
      maxSearchLimit: account.maxSearchLimit,
    };
  });
}
