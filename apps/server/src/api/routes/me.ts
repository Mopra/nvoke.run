import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@nvoke/shared';
import type { UserDirectory } from '../../auth/users.js';

export async function meRoutes(app: FastifyInstance, opts: { users: UserDirectory | null }): Promise<void> {
  app.get('/me', { preHandler: app.requireAuth }, async (req): Promise<MeResponse> => {
    // requireAuth has either set req.auth or already replied.
    const auth = req.auth!;
    let profile = { email: null as string | null, name: null as string | null, imageUrl: null as string | null };
    if (opts.users) {
      try {
        profile = await opts.users.getProfile(auth.userId);
      } catch (err) {
        // The user is authenticated either way; profile fields are best effort.
        req.log.warn({ err }, 'clerk user lookup failed');
      }
    }
    return { userId: auth.userId, via: auth.via, ...profile };
  });
}
