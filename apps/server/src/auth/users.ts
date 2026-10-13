import { createClerkClient } from '@clerk/backend';

export interface UserProfile {
  email: string | null;
  name: string | null;
  imageUrl: string | null;
}

/** Looks up profile fields for a Clerk user id. */
export interface UserDirectory {
  getProfile(clerkUserId: string): Promise<UserProfile>;
}

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX = 1000;

/** Clerk Backend API lookups with a short in-process cache. */
export function clerkUserDirectory(secretKey: string): UserDirectory {
  const clerk = createClerkClient({ secretKey });
  const cache = new Map<string, { at: number; profile: UserProfile }>();

  return {
    async getProfile(clerkUserId) {
      const hit = cache.get(clerkUserId);
      if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.profile;

      const user = await clerk.users.getUser(clerkUserId);
      const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
      const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || null;
      const profile: UserProfile = {
        email: primary?.emailAddress ?? null,
        name,
        imageUrl: user.imageUrl || null,
      };

      if (cache.size >= CACHE_MAX) cache.clear();
      cache.set(clerkUserId, { at: Date.now(), profile });
      return profile;
    },
  };
}
