import robotsParser from 'robots-parser';
import { BOT_TOKEN, BOT_USER_AGENT } from '@nvoke/shared/crawl';

/**
 * robots.txt for the local render crawl, read the way the server reads it
 * (RFC 9309): 2xx is obeyed for nvokebot, 4xx allows everything, 5xx or a
 * network failure disallows everything. Cached per origin for an hour.
 */

const ROBOTS_MAX_BYTES = 500_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_CRAWL_DELAY_MS = 10_000;
const MAX_REDIRECTS = 5;

export interface RobotsRules {
  isAllowed(url: string): boolean;
  crawlDelayMs?: number;
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true };
const DISALLOW_ALL: RobotsRules = { isAllowed: () => false };

export function parseRobots(robotsUrl: string, text: string): RobotsRules {
  const robots = robotsParser(robotsUrl, text);
  const delay = robots.getCrawlDelay(BOT_TOKEN);
  return {
    isAllowed: (url) => robots.isAllowed(url, BOT_TOKEN) ?? false,
    crawlDelayMs: typeof delay === 'number' && delay > 0 ? Math.min(MAX_CRAWL_DELAY_MS, Math.round(delay * 1000)) : undefined,
  };
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class RobotsCache {
  private readonly cache = new Map<string, { at: number; rules: Promise<RobotsRules> }>();

  constructor(
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly now: () => number = Date.now,
    /** Called before robots.txt is fetched, so that request also keeps to the per host pace. */
    private readonly beforeFetch: (host: string) => Promise<void> = () => Promise.resolve(),
    /** False for a host robots.txt may not be fetched from (a local or private address). */
    private readonly allowHost: (host: string) => Promise<boolean> = () => Promise.resolve(true),
  ) {}

  rulesFor(url: string): Promise<RobotsRules> {
    const u = new URL(url);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const hit = this.cache.get(robotsUrl);
    if (hit && this.now() - hit.at < CACHE_TTL_MS) return hit.rules;
    const rules = this.load(robotsUrl);
    this.cache.set(robotsUrl, { at: this.now(), rules });
    return rules;
  }

  private async load(robotsUrl: string): Promise<RobotsRules> {
    // Redirects are followed by hand, so each hop is checked like a page load.
    let url = robotsUrl;
    let res: Response | null = null;
    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const host = new URL(url).hostname;
        if (!(await this.allowHost(host))) return DISALLOW_ALL;
        await this.beforeFetch(host);
        res = await this.fetchFn(url, {
          headers: { 'user-agent': BOT_USER_AGENT, accept: 'text/plain,*/*;q=0.5' },
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        const location = res.headers.get('location');
        if (res.status < 300 || res.status >= 400 || !location) break;
        url = new URL(location, url).toString();
        res = null;
      }
    } catch {
      return DISALLOW_ALL;
    }
    if (!res) return DISALLOW_ALL;
    if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
    if (res.status < 200 || res.status >= 300) return DISALLOW_ALL;
    try {
      const text = await res.text();
      // Parsed against the origin we asked about, like the server does.
      return parseRobots(robotsUrl, text.slice(0, ROBOTS_MAX_BYTES));
    } catch {
      return DISALLOW_ALL;
    }
  }
}
