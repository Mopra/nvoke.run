'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { trackEvent } from '@/components/site/analytics';

const SENT_KEY = 'nvoke.ga.sign-up';
// An account this young was made by the sign-up that just led here.
const FRESH_MS = 30 * 60 * 1000;

/**
 * Sends GA4 sign_up once per account, on the first Clerk page after the
 * account is created (the web app, /desktop or /claim). Clerk has no client
 * hook for "sign-up completed" across redirects, so a new account is one
 * created in the last 30 minutes, and localStorage keeps a reload or a
 * second tab from sending it again.
 */
export function SignUpTracking() {
  const { user } = useUser();

  useEffect(() => {
    if (!user?.createdAt || Date.now() - user.createdAt.getTime() > FRESH_MS) return;
    try {
      if (localStorage.getItem(SENT_KEY) === user.id) return;
      localStorage.setItem(SENT_KEY, user.id);
    } catch {
      // No storage (private mode): send anyway, a rare double count beats none.
    }
    trackEvent('sign_up', { method: user.externalAccounts[0]?.provider ?? 'email' });
  }, [user]);

  return null;
}
