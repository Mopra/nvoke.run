// A screenshot of the user's homepage, for a site profile when the site has
// no share image of its own. Headless Chromium (playwright-core) renders the
// page, but never touches the network itself: every request it makes goes
// through the guarded fetch (src/profile/guarded-fetch.ts) and is fulfilled
// from there, so a page cannot reach a private or local address, not even
// through a redirect or a DNS answer that changes. Off unless SITE_SHOTS is
// true; the browser is installed on the VPS by deploy/deploy.sh.

import type { Logger } from 'pino';
import { BOT_USER_AGENT, type FetchLike } from '../leads/http.js';

const VIEWPORT = { width: 1280, height: 800 };
/** The whole shot, browser start included. */
const SHOT_TIMEOUT_MS = 15_000;
/** Longest wait for a quiet network after the load event. */
const NETWORK_IDLE_MS = 4_000;
/** Then time for fonts, images and entrance animations, many of them script driven. */
const SETTLE_MS = 2_000;
const MAX_REQUESTS = 600;
const MAX_BYTES = 40_000_000;

export type ShootSite = (url: string, signal?: AbortSignal) => Promise<Buffer | null>;

/**
 * One browser at a time, and at most one shot waiting: a build that would
 * wait longer goes without a picture rather than pile up Chromiums.
 */
export function siteShooter(fetch: FetchLike, log: Pick<Logger, 'warn'>): ShootSite {
  let running: Promise<unknown> = Promise.resolve();
  let waiting = 0;

  return async (url, signal) => {
    if (waiting >= 1) return null;
    waiting += 1;
    const previous = running;
    const shot = previous.then(() => {
      waiting -= 1;
      return shoot(fetch, url, signal);
    });
    running = shot.catch(() => undefined);
    try {
      return await shot;
    } catch (err) {
      log.warn({ err, url }, 'site profile: screenshot failed');
      return null;
    }
  };
}

async function shoot(fetch: FetchLike, url: string, outer?: AbortSignal): Promise<Buffer | null> {
  if (outer?.aborted) return null;
  const signal = AbortSignal.any([...(outer ? [outer] : []), AbortSignal.timeout(SHOT_TIMEOUT_MS)]);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({
    headless: true,
    timeout: SHOT_TIMEOUT_MS,
    // The API's systemd unit forbids the namespaces Chromium's own sandbox
    // needs; the unit (unprivileged user, read-only system, private /tmp) is
    // the sandbox, and the page reaches the network only through the guard.
    chromiumSandbox: false,
    // WebRTC could otherwise open UDP past the request routing.
    args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--disable-features=WebRtcHideLocalIpsWithMdns', '--disable-dev-shm-usage'],
  });
  const close = () => void browser.close().catch(() => undefined);
  signal.addEventListener('abort', close, { once: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: BOT_USER_AGENT,
      serviceWorkers: 'block',
      acceptDownloads: false,
      colorScheme: 'light',
    });
    // WebSockets are not routed like requests: close them.
    await context.routeWebSocket(/.*/, (ws) => ws.close());
    let requests = 0;
    let bytes = 0;
    await context.route('**/*', async (route) => {
      const request = route.request();
      requests += 1;
      if (requests > MAX_REQUESTS || bytes > MAX_BYTES || !['GET', 'HEAD'].includes(request.method())) return route.abort();
      try {
        // Plain bodies: the guarded fetch does not decompress, and fulfill wants the final bytes.
        const res = await fetch(request.url(), {
          method: request.method(),
          headers: { ...request.headers(), 'accept-encoding': 'identity' },
          redirect: 'manual',
          signal,
        });
        const body = Buffer.from(await res.arrayBuffer());
        bytes += body.length;
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key)) headers[key] = value;
        });
        await route.fulfill({ status: res.status, headers, body });
      } catch {
        await route.abort().catch(() => undefined);
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: SHOT_TIMEOUT_MS });
    // Quiet network, or give up waiting for it: analytics beacons keep some pages busy.
    await page.waitForLoadState('networkidle', { timeout: NETWORK_IDLE_MS }).catch(() => undefined);
    await page.waitForTimeout(SETTLE_MS);
    if (signal.aborted) return null;
    return await page.screenshot({ type: 'jpeg', quality: 72, animations: 'disabled', timeout: 5_000 });
  } finally {
    signal.removeEventListener('abort', close);
    close();
  }
}
