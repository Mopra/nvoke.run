'use client';

import Script from 'next/script';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? '';
const STORAGE_KEY = 'nvoke.consent.analytics';
const OPEN_EVENT = 'nvoke:cookie-settings';

type Choice = 'granted' | 'denied';

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

// Holds the choice where localStorage throws (private mode), for this page view.
let sessionChoice: Choice | null = null;

function readChoice(): Choice | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : sessionChoice;
  } catch {
    return sessionChoice;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Reopens the consent bar, for the footer's Cookie settings link. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * Google Analytics 4 under Consent Mode v2. Everything is denied until the
 * visitor accepts, so GA sets no cookies before that. Accepting grants
 * analytics_storage only; the ad signals stay denied. Renders nothing when
 * NEXT_PUBLIC_GA_MEASUREMENT_ID is empty.
 */
export function Analytics() {
  // The server snapshot counts as decided, so static HTML never shows the bar.
  const choice = useSyncExternalStore(subscribe, readChoice, () => 'denied' as const);
  const [reopened, setReopened] = useState(false);
  const open = reopened || choice === null;

  useEffect(() => {
    if (!GA_ID) return;
    const reopen = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  if (!GA_ID) return null;

  function choose(choice: Choice) {
    sessionChoice = choice;
    try {
      localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      // Private mode: sessionChoice keeps it until the page reloads.
    }
    window.gtag?.('consent', 'update', { analytics_storage: choice });
    setReopened(false);
    listeners.forEach((listener) => listener());
  }

  return (
    <>
      <Script id="ga-consent" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var stored = null;
try { stored = localStorage.getItem('${STORAGE_KEY}'); } catch (e) {}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: stored === 'granted' ? 'granted' : 'denied'
});
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      {open && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
          <div
            role="dialog"
            aria-label="Cookie consent"
            className="panel pointer-events-auto flex w-full max-w-[560px] flex-col gap-3 py-3 pr-3 pl-4 text-[14px] text-foreground/80 sm:flex-row sm:items-center"
          >
            <p className="flex-1">
              Can we count visits with Google Analytics? No ads, no tracking across sites.{' '}
              <a href="/privacy#website" className="underline underline-offset-4 hover:text-foreground">
                Details
              </a>
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => choose('denied')}>
                Decline
              </Button>
              <Button variant="dark" size="sm" onClick={() => choose('granted')}>
                Accept
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
