// Cloudflare Turnstile siteverify for the free tools. Optional: without
// TURNSTILE_SECRET_KEY the tools rely on the rate limits alone.

import type { FetchLike } from '../leads/http.js';

/** Resolves true when the token passed. Never throws. */
export type TurnstileCheck = (token: string | undefined, ip: string) => Promise<boolean>;

const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function turnstileCheck(secret: string, fetchImpl: FetchLike = fetch): TurnstileCheck {
  return async (token, ip) => {
    if (!token) return false;
    try {
      const res = await fetchImpl(SITEVERIFY, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { success?: unknown };
      return data.success === true;
    } catch {
      return false;
    }
  };
}
