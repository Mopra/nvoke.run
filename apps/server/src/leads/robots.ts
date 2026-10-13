// robots.txt handling, following RFC 9309:
//   2xx            parse and obey the group for nvokebot (or *)
//   4xx            "unavailable": no restrictions
//   5xx, network   "unreachable": assume complete disallow
// Results are cached per origin for an hour in this process.

import { createRequire } from 'node:module';
import { BOT_TOKEN, fetchCapped, type FetchLike } from './http.js';
import type { RateLimiter } from './limits.js';

interface RobotsParserResult {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}

// robots-parser is CommonJS (module.exports = function) and its typings
// declare an ESM default export, so load it through require with our own type.
const robotsParser = createRequire(import.meta.url)('robots-parser') as (url: string, txt: string) => RobotsParserResult;

const ROBOTS_MAX_BYTES = 500_000;
const CACHE_TTL_MS = 60 * 60_000;
const MAX_CRAWL_DELAY_MS = 10_000;

export interface RobotsRules {
  isAllowed(url: string): boolean;
  /** Crawl-delay for our group, in milliseconds, capped at 10 seconds. */
  crawlDelayMs?: number;
  /** How the rules were obtained, for logs. */
  source: 'parsed' | 'unavailable' | 'unreachable';
}

const ALLOW_ALL: RobotsRules = { isAllowed: () => true, source: 'unavailable' };
const DISALLOW_ALL: RobotsRules = { isAllowed: () => false, source: 'unreachable' };

export function parseRobots(robotsUrl: string, text: string): RobotsRules {
  const robots = robotsParser(robotsUrl, text);
  const delay = robots.getCrawlDelay(BOT_TOKEN);
  return {
    // robots-parser answers undefined for a URL on another origin. That never
    // happens here because rules are looked up per origin, but be strict.
    isAllowed: (url) => robots.isAllowed(url, BOT_TOKEN) ?? false,
    crawlDelayMs:
      typeof delay === 'number' && delay > 0 ? Math.min(MAX_CRAWL_DELAY_MS, Math.round(delay * 1000)) : undefined,
    source: 'parsed',
  };
}

export function robotsUrlFor(url: string): string {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/robots.txt`;
}

export interface RobotsCacheOptions {
  fetch?: FetchLike;
  limiter?: RateLimiter;
  ttlMs?: number;
  now?: () => number;
}

export class RobotsCache {
  private readonly cache = new Map<string, { at: number; rules: Promise<RobotsRules> }>();

  constructor(private readonly opts: RobotsCacheOptions = {}) {}

  rulesFor(url: string, signal?: AbortSignal): Promise<RobotsRules> {
    const robotsUrl = robotsUrlFor(url);
    const now = (this.opts.now ?? Date.now)();
    const hit = this.cache.get(robotsUrl);
    if (hit && now - hit.at < (this.opts.ttlMs ?? CACHE_TTL_MS)) return hit.rules;
    const rules = this.load(robotsUrl, signal);
    this.cache.set(robotsUrl, { at: now, rules });
    // A fetch aborted by the caller must not poison the cache for everyone else.
    rules.catch(() => this.cache.delete(robotsUrl));
    return rules;
  }

  private async load(robotsUrl: string, signal?: AbortSignal): Promise<RobotsRules> {
    const host = new URL(robotsUrl).hostname;
    await this.opts.limiter?.wait(host, signal);
    let res;
    try {
      res = await fetchCapped(robotsUrl, {
        fetch: this.opts.fetch,
        maxBytes: ROBOTS_MAX_BYTES,
        timeoutMs: 10_000,
        signal,
        headers: { accept: 'text/plain,*/*;q=0.5' },
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      return DISALLOW_ALL;
    }
    // Parsed against the origin we asked about: a robots.txt that redirects
    // (http to https, bare to www) still governs the origin that served it.
    if (res.status >= 200 && res.status < 300) return parseRobots(robotsUrl, res.body.toString('utf8'));
    if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
    return DISALLOW_ALL;
  }
}
