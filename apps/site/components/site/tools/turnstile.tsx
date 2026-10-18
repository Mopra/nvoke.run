'use client';

import Script from 'next/script';
import { useCallback, useRef, type ReactNode } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Cloudflare Turnstile, only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set.
 * `getToken` waits for the widget (at most 15 seconds) and resolves
 * undefined without a site key; `reset` asks for a fresh token after each
 * request, since a token is single use.
 */
export function useTurnstile(): { widget: ReactNode; getToken: () => Promise<string | undefined>; reset: () => void } {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  const waiters = useRef<((t: string | undefined) => void)[]>([]);

  const settle = (value: string | undefined) => {
    const pending = waiters.current;
    waiters.current = [];
    for (const resolve of pending) resolve(value);
  };

  const mount = () => {
    const api = window.turnstile;
    if (!api || !box.current || widgetId.current) return;
    widgetId.current = api.render(box.current, {
      sitekey: SITE_KEY,
      appearance: 'interaction-only',
      callback: (t: string) => {
        token.current = t;
        settle(t);
      },
      'expired-callback': () => {
        token.current = null;
      },
      'error-callback': () => {
        token.current = null;
        settle(undefined);
      },
    });
  };

  const getToken = useCallback((): Promise<string | undefined> => {
    if (!SITE_KEY) return Promise.resolve(undefined);
    if (token.current) return Promise.resolve(token.current);
    return new Promise((resolve) => {
      waiters.current.push(resolve);
      setTimeout(() => resolve(undefined), 15_000);
    });
  }, []);

  const reset = useCallback(() => {
    token.current = null;
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  const widget = SITE_KEY ? (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={mount}
      />
      <div ref={box} className="flex empty:hidden" />
    </>
  ) : null;

  return { widget, getToken, reset };
}
