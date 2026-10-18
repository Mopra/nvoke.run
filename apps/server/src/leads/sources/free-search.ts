// A free web search for when Brave is out of credit, paused or not
// configured (FREE_SEARCH=fallback, the default), or ahead of Brave
// (FREE_SEARCH=first). It answers through the same interface as the Brave
// client, so the web, domains, local and icp adapters use it unchanged.
//
// The provider is Mwmbl (mwmbl.org), a non-profit open source search engine
// with a public JSON API that needs no account. Others were tried on
// 2026-10-18 and left out: DuckDuckGo's HTML endpoint answers an honest
// user agent with a puzzle (from this machine and the VPS), Mojeek's,
// Bing's, Yahoo's, Ecosia's, Qwant's, Startpage's and Brave's own robots.txt
// disallow their search pages, Yep sits behind a Cloudflare block and
// Marginalia's shared public key is for experiments (and spent daily).
//
// Rules, as for every source somebody else runs: one request every few
// seconds, a user agent naming nvoke, results cached for reuse, and any
// challenge, 403, 429 or 503 stops the provider for a while. Nothing ever
// tries to get around a refusal. Free requests are never reported through
// onUsage, so they are not priced as Brave requests.

import { normalizeDomain } from '../domain.js';
import { fetchCapped, HttpError, type FetchLike } from '../http.js';
import { RateLimiter } from '../limits.js';
import type { CachedWebPage, WebSearchCache } from '../web-cache.js';
import { SourceUnavailableError, type FoundCompany, type SourceContext } from './types.js';
import { nameFromTitle, type BraveClient, type BravePageRequest } from './web.js';

export const FREE_SEARCH_MODES = ['off', 'fallback', 'first'] as const;
export type FreeSearchMode = (typeof FREE_SEARCH_MODES)[number];

/** FREE_SEARCH as a mode: unset or unknown is `fallback`. */
export function freeSearchMode(value: string | undefined = process.env.FREE_SEARCH): FreeSearchMode {
  const v = value?.trim().toLowerCase();
  return (FREE_SEARCH_MODES as readonly string[]).includes(v ?? '') ? (v as FreeSearchMode) : 'fallback';
}

/** The name free search pauses are kept under in source_pauses. */
export const FREE_SEARCH_SOURCE = 'free_search';

export const MWMBL_ENDPOINT = 'https://api.mwmbl.org/api/v1/search/';
/** Seconds between two requests to one provider. */
const DEFAULT_INTERVAL_MS = 3_000;
/** How long a provider that refused or challenged us is left alone. */
export const FREE_BLOCK_MS = 30 * 60_000;
/** Failed queries in a row (timeouts, server errors) that count as the provider being down. */
const MAX_FAILED_IN_A_ROW = 5;

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });

function countryName(code: string): string | undefined {
  try {
    return countryNames.of(code.toUpperCase());
  } catch {
    return undefined;
  }
}

/** A provider that refused us (challenge, 403, 429, 503): left alone for FREE_BLOCK_MS. */
export class FreeSearchBlockedError extends SourceUnavailableError {
  constructor(provider: string, reason: string) {
    super(FREE_SEARCH_SOURCE, `${provider} ${reason}`);
    this.name = 'FreeSearchBlockedError';
  }
}

/**
 * A Brave query as words a plain search engine understands. Operators
 * (`site:`, `OR`, quotes, parentheses, `-word`) are dropped, and the hosts
 * the `site:` operators named are returned so results can be held to them.
 */
export function plainQuery(q: string): { words: string; sites: string[] } {
  const sites: string[] = [];
  const words = q
    .replace(/\bsite:(\S+)/gi, (_, host: string) => {
      sites.push(host.replace(/[()"]/g, '').toLowerCase());
      return ' ';
    })
    .replace(/["()]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && w !== 'OR' && w !== 'AND' && !w.startsWith('-'))
    .join(' ');
  return { words, sites };
}

interface MwmblSpan {
  value?: string;
}
interface MwmblResult {
  url?: string;
  title?: MwmblSpan[] | string;
  extract?: MwmblSpan[] | string;
}

function spans(v: MwmblSpan[] | string | undefined, max: number): string | undefined {
  const text = (Array.isArray(v) ? v.map((s) => s.value ?? '').join('') : (v ?? '')).replace(/\s+/g, ' ').trim().slice(0, max);
  return text || undefined;
}

/** One Mwmbl result as a company, or null for a URL that is not a site. */
export function mwmblResultToCompany(r: MwmblResult): FoundCompany | null {
  if (!r.url) return null;
  const domain = normalizeDomain(r.url);
  if (!domain) return null;
  let website: string;
  try {
    website = new URL(r.url).origin;
  } catch {
    return null;
  }
  const title = spans(r.title, 200);
  const snippet = spans(r.extract, 400);
  return {
    name: nameFromTitle(title, domain),
    website,
    source: 'mwmbl',
    sourceRef: r.url,
    ...(title ? { title } : {}),
    ...(snippet ? { snippet } : {}),
  };
}

/** Whether a result's host is one of the `site:` hosts, or under one. */
function onSites(url: string, sites: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  return sites.some((s) => {
    const site = s.replace(/^www\./, '').split('/')[0]!;
    return host === site || host.endsWith(`.${site}`);
  });
}

/** A body that is a challenge or block page rather than results. */
export function looksLikeChallenge(body: string): boolean {
  return /anomaly-modal|captcha|cf-chl|challenge-platform|Attention Required|are you a robot|unusual traffic/i.test(body.slice(0, 20_000));
}

export interface FreeProvider {
  readonly name: string;
  /** One query's results. Throws FreeSearchBlockedError when the provider refuses us. */
  search(words: string, ctx: SourceContext): Promise<FoundCompany[]>;
}

export interface MwmblOptions {
  fetch?: FetchLike;
  endpoint?: string;
  intervalMs?: number;
  now?: () => number;
}

export function mwmblProvider(opts: MwmblOptions = {}): FreeProvider {
  const limiter = new RateLimiter(opts.intervalMs ?? DEFAULT_INTERVAL_MS);
  return {
    name: 'mwmbl',
    async search(words, ctx) {
      const url = new URL(opts.endpoint ?? MWMBL_ENDPOINT);
      url.searchParams.set('s', words);
      // One more try for an empty or cut answer, which Mwmbl sends now and then.
      for (let attempt = 1; ; attempt++) {
        await limiter.wait('mwmbl', ctx.signal);
        const res = await fetchCapped(url.toString(), {
          fetch: opts.fetch,
          signal: ctx.signal,
          timeoutMs: 30_000,
          maxBytes: 1_000_000,
          headers: { accept: 'application/json' },
        });
        const text = res.body.toString('utf8');
        const refused = () => new FreeSearchBlockedError('mwmbl', `refused us (${res.status} ${text.slice(0, 120).replace(/\s+/g, ' ')})`);
        if (res.status === 403 || res.status === 429 || res.status === 503) throw refused();
        // Only a body that is not JSON can be a challenge page: results may well mention a captcha.
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          if (looksLikeChallenge(text)) throw refused();
          if (!res.ok) throw new HttpError(res.status, `mwmbl search failed with ${res.status}`, text.slice(0, 200));
          if (attempt < 2) continue;
          throw new HttpError(res.status, 'mwmbl returned invalid JSON', text.slice(0, 200));
        }
        if (!res.ok) throw new HttpError(res.status, `mwmbl search failed with ${res.status}`, text.slice(0, 200));
        if (!Array.isArray(parsed)) throw new HttpError(res.status, 'mwmbl returned an unexpected answer', text.slice(0, 200));
        return (parsed as MwmblResult[]).map(mwmblResultToCompany).filter((c): c is FoundCompany => c !== null);
      }
    },
  };
}

export interface FreeClientOptions {
  provider: FreeProvider;
  cache?: WebSearchCache;
  now?: () => number;
  /** Called when the provider refuses us, so other processes know (source_pauses). */
  onBlocked?: (err: FreeSearchBlockedError) => Promise<void>;
}

/** Requests and cache hits of the free provider since start, for logs and the eval. */
export interface FreeSearchStats {
  requests: number;
  cacheHits: number;
  blocked: number;
}

export interface FreeClient extends BraveClient {
  readonly provider: string;
  readonly stats: FreeSearchStats;
  /** True while the provider is left alone after refusing us. */
  blocked(): boolean;
}

/**
 * The free provider behind the Brave client's interface. Its pages share
 * web_search_cache under their own country key (`mwmbl:` plus the country),
 * so they never mix with Brave's and are free on reuse.
 */
export function freeClient(opts: FreeClientOptions): FreeClient {
  const now = opts.now ?? Date.now;
  const stats: FreeSearchStats = { requests: 0, cacheHits: 0, blocked: 0 };
  let blockedUntil = 0;
  let blockReason = '';
  let failedInARow = 0;
  const p = opts.provider;

  const run = async (words: string, sites: string[], ctx: SourceContext): Promise<FoundCompany[]> => {
    stats.requests++;
    const found = await p.search(words, ctx);
    return sites.length ? found.filter((c) => onSites(c.sourceRef ?? c.website, sites)) : found;
  };

  const fetchPage = async (req: BravePageRequest, ctx: SourceContext): Promise<CachedWebPage> => {
    const { words, sites } = plainQuery(req.q);
    if (!words) return { companies: [], more: false };
    const name = req.country ? countryName(req.country) : undefined;
    const place = name && name.toLowerCase() !== req.country?.toLowerCase() && !words.toLowerCase().includes(name.toLowerCase()) ? name : undefined;
    let companies = await run(place ? `${words} ${place}` : words, sites, ctx);
    // Mwmbl matches every word, so a long query often finds nothing: one try with less.
    if (companies.length === 0) {
      const fewer = place ? words : words.split(' ').length >= 3 ? words.split(' ').slice(0, -1).join(' ') : '';
      if (fewer) companies = await run(fewer, sites, ctx);
    }
    // One page holds every result the provider returns.
    return { companies, more: false };
  };

  return {
    provider: p.name,
    configured: true,
    stats,
    blocked: () => now() < blockedUntil,
    async page(req, ctx) {
      if (req.page > 0) return { companies: [], more: false };
      const key = { q: req.q, country: `${p.name}:${req.country ?? ''}`, page: 0 };
      // An empty answer is kept for today only (its own key per UTC day): the index grows, and Mwmbl sometimes answers empty.
      const emptyKey = { ...key, country: `${key.country}:empty:${new Date(now()).toISOString().slice(0, 10)}` };
      const read = (k: typeof key) =>
        opts.cache?.get(k).catch((err: unknown) => {
          ctx.log.warn({ err }, 'free search: cache read failed');
          return null;
        }) ?? Promise.resolve(null);
      const cached = (await read(key)) ?? (await read(emptyKey));
      if (cached) {
        stats.cacheHits++;
        return cached;
      }
      if (now() < blockedUntil) throw new FreeSearchBlockedError(p.name, `is left alone after refusing us (${blockReason})`);
      try {
        let result: CachedWebPage;
        try {
          result = await fetchPage(req, ctx);
          failedInARow = 0;
        } catch (err) {
          if (err instanceof FreeSearchBlockedError || ctx.signal.aborted) throw err;
          // A slow or broken answer costs this query, not the search, unless it keeps happening.
          const said = err instanceof Error ? err.message : String(err);
          if (++failedInARow >= MAX_FAILED_IN_A_ROW) throw new FreeSearchBlockedError(p.name, `failed ${failedInARow} times in a row (${said})`);
          ctx.log.warn({ provider: p.name, q: req.q, err: said }, 'free search: query failed, skipping it');
          return { companies: [], more: false };
        }
        await opts.cache?.put(result.companies.length ? key : emptyKey, result).catch((err: unknown) => ctx.log.warn({ err }, 'free search: cache write failed'));
        return result;
      } catch (err) {
        if (err instanceof FreeSearchBlockedError) {
          stats.blocked++;
          failedInARow = 0;
          blockedUntil = now() + FREE_BLOCK_MS;
          blockReason = err.reason;
          ctx.log.warn({ provider: p.name, reason: err.reason }, 'free search: provider refused us, leaving it alone');
          await opts.onBlocked?.(err).catch((e: unknown) => ctx.log.warn({ err: e }, 'free search: could not record the pause'));
        }
        throw err;
      }
    },
  };
}

export interface SearchClientOptions {
  brave: BraveClient;
  free: FreeClient;
  mode: FreeSearchMode;
  /** Whether Brave is paused in source_pauses (by any process). */
  bravePaused?: () => Promise<boolean>;
  /** Called once when Brave refuses us and the free provider takes over: pause and alert. */
  onUnavailable?: (err: SourceUnavailableError) => Promise<void>;
  now?: () => number;
  /** How long a Brave refusal sends every search to the free provider. Default SOURCE_PAUSE_MS. */
  braveDownMs?: number;
}

/** The Brave client with the free provider as fallback (or first), per FREE_SEARCH. */
export function searchClient(opts: SearchClientOptions): BraveClient {
  const { brave, free, mode } = opts;
  if (mode === 'off') return brave;
  const now = opts.now ?? Date.now;
  let braveDownUntil = 0;
  let downReason = '';
  // Runs already told that results come from the free provider, by their abort signal.
  const noted = new WeakSet<AbortSignal>();
  let pausedCheck: { at: number; paused: boolean } = { at: -Infinity, paused: false };

  const braveUsable = async (): Promise<boolean> => {
    if (!brave.configured || now() < braveDownUntil) return false;
    if (!opts.bravePaused) return true;
    if (now() - pausedCheck.at > 30_000) {
      const paused = await opts.bravePaused().catch(() => false);
      pausedCheck = { at: now(), paused };
    }
    return !pausedCheck.paused;
  };

  const note = async (ctx: SourceContext, why: string) => {
    if (noted.has(ctx.signal)) return;
    noted.add(ctx.signal);
    ctx.log.warn({ provider: free.provider, why }, 'web search: using the free provider');
    if (ctx.signal.aborted) return;
    await ctx.onStage?.('fallback', `Our main web search is ${why}, so nvoke is searching with ${free.provider === 'mwmbl' ? 'Mwmbl' : free.provider}, a free search engine. Expect fewer results`);
  };

  const viaFree = async (req: BravePageRequest, ctx: SourceContext, why: string, cause?: SourceUnavailableError): Promise<CachedWebPage> => {
    try {
      const page = await free.page(req, ctx);
      if (req.page === 0) await note(ctx, why);
      return page;
    } catch (err) {
      // Both are out: fail as Brave alone would, so the search says what happened.
      if (err instanceof FreeSearchBlockedError) {
        throw cause ?? new SourceUnavailableError('brave', `${downReason || 'paused or not configured'}, and the free search is unavailable (${err.reason})`);
      }
      throw err;
    }
  };

  const fromBrave = async (req: BravePageRequest, ctx: SourceContext): Promise<CachedWebPage> => {
    // Pages Brave already answered stay free, even while it is down.
    if (!(await braveUsable())) {
      const cached = await brave.cached?.(req, ctx);
      if (cached) return cached;
      return viaFree(req, ctx, brave.configured ? 'unavailable right now' : 'not configured on this server');
    }
    try {
      return await brave.page(req, ctx);
    } catch (err) {
      if (!(err instanceof SourceUnavailableError) || ctx.signal.aborted) throw err;
      const first = now() >= braveDownUntil;
      braveDownUntil = now() + (opts.braveDownMs ?? 10 * 60_000);
      downReason = err.reason;
      if (first) await opts.onUnavailable?.(err).catch((e: unknown) => ctx.log.warn({ err: e }, 'web search: could not pause Brave'));
      return viaFree(req, ctx, 'unavailable right now', err);
    }
  };

  return {
    configured: true,
    cached: brave.cached,
    async page(req, ctx) {
      // Later pages are Brave's: the free provider answers in one page.
      if (mode === 'first' && req.page === 0 && !free.blocked()) {
        try {
          const page = await free.page(req, ctx);
          if (page.companies.length > 0) return page;
        } catch (err) {
          if (!(err instanceof FreeSearchBlockedError)) throw err;
        }
        // Nothing free: Brave when it can, else the empty answer.
        if (!(await braveUsable())) {
          const cached = await brave.cached?.(req, ctx);
          return cached ?? { companies: [], more: false };
        }
      }
      return fromBrave(req, ctx);
    },
  };
}
