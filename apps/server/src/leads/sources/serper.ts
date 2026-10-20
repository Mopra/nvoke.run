// Google results from Serper (serper.dev), a cheaper paid web search than
// Brave: from $1.00 per 1,000 queries down to $0.30 at volume, against
// Brave's $5. Off by default: WEB_SEARCH_PROVIDER=serper makes it the
// primary, WEB_SEARCH_FALLBACK=serper the fallback (paid-search.ts).
//
// API: POST https://google.serper.dev/search with the key in X-API-KEY and a
// JSON body { q, gl, num, page }. `gl` is the country (two letters, lower
// case), `page` counts from 1 and `num` is results per page. The answer
// lists the results in `organic` ({ title, link, snippet, position }).
//
// Google serves 10 results a page, and Serper bills a query asking for more
// than 10 as two credits, so one page of ours (PAGE_SIZE, 20) is two Serper
// pages of 10, each counted as one paid request. That keeps our pages the
// same window of results as Brave's, so the shared cache stays consistent.

import { normalizeDomain } from '../domain.js';
import { fetchJson, HttpError, type FetchLike } from '../http.js';
import { RateLimiter, sleep } from '../limits.js';
import { SourceUnavailableError, type FoundCompany, type SourceContext } from './types.js';
import { nameFromTitle, PAGE_SIZE, type BravePageRequest, type PaidSearchProvider } from './web.js';

export const SERPER_ENDPOINT = 'https://google.serper.dev/search';
/** Results per Serper request: one credit each. */
const SERPER_PAGE_SIZE = 10;
const PARTS = PAGE_SIZE / SERPER_PAGE_SIZE;
/**
 * Requests per second we allow ourselves. Serper's smallest paid plan allows
 * 50; staying far below it keeps a runaway loop cheap.
 */
const DEFAULT_REQUESTS_PER_SECOND = 5;

interface SerperResult {
  title?: string;
  link?: string;
  snippet?: string;
  position?: number;
}

interface SerperResponse {
  organic?: SerperResult[];
}

export interface SerperOptions {
  apiKey: string | undefined;
  fetch?: FetchLike;
  endpoint?: string;
  requestsPerSecond?: number;
}

function plain(text: string | undefined, max: number): string | undefined {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  return clean || undefined;
}

/** One organic result as a company, or null for a link that is not a site. */
export function serperResultToCompany(r: SerperResult): FoundCompany | null {
  if (!r.link) return null;
  const domain = normalizeDomain(r.link);
  if (!domain) return null;
  let website: string;
  try {
    website = new URL(r.link).origin;
  } catch {
    return null;
  }
  const title = plain(r.title, 200);
  const snippet = plain(r.snippet, 400);
  return {
    name: nameFromTitle(r.title, domain),
    website,
    source: 'serper',
    sourceRef: r.link,
    category: undefined,
    ...(title ? { title } : {}),
    ...(snippet ? { snippet } : {}),
  };
}

/** Serper as a paid web search. A refusal is SourceUnavailableError('serper'), paused and alerted like Brave's. */
export function serperProvider(opts: SerperOptions): PaidSearchProvider {
  const limiter = new RateLimiter(Math.ceil(1_100 / (opts.requestsPerSecond ?? DEFAULT_REQUESTS_PER_SECOND)));
  const apiKey = opts.apiKey;

  const one = async (req: BravePageRequest, page: number, ctx: SourceContext): Promise<SerperResult[]> => {
    const body = JSON.stringify({
      q: req.q,
      ...(req.country ? { gl: req.country } : {}),
      num: SERPER_PAGE_SIZE,
      page,
    });
    for (let attempt = 1; ; attempt++) {
      await limiter.wait('serper', ctx.signal);
      try {
        const res = await fetchJson<SerperResponse>(opts.endpoint ?? SERPER_ENDPOINT, {
          fetch: opts.fetch,
          signal: ctx.signal,
          timeoutMs: 20_000,
          method: 'POST',
          body,
          headers: { 'x-api-key': apiKey ?? '', 'content-type': 'application/json' },
        });
        // Serper bills answered requests only.
        ctx.onUsage?.('request');
        return res.organic ?? [];
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const said = `${err.status} ${(err.bodySnippet ?? '').slice(0, 300)}`.trim();
        if (err.status === 401 || err.status === 402 || err.status === 403) {
          throw new SourceUnavailableError('serper', `the key or credit was refused (${said})`);
        }
        if (err.status === 400 && /credit/i.test(err.bodySnippet ?? '')) {
          throw new SourceUnavailableError('serper', `the credits are spent (${said})`);
        }
        if (err.status !== 429) throw err;
        if (attempt >= 3) throw new SourceUnavailableError('serper', `the rate limit keeps refusing us (${said})`);
        await sleep(attempt * 1_000, ctx.signal);
      }
    }
  };

  return {
    name: 'serper',
    configured: Boolean(apiKey),
    keyVar: 'SERPER_API_KEY',
    async fetchPage(req, ctx) {
      const companies: FoundCompany[] = [];
      let full = false;
      for (let part = 0; part < PARTS; part++) {
        const results = await one(req, req.page * PARTS + part + 1, ctx);
        companies.push(...results.map(serperResultToCompany).filter((c): c is FoundCompany => c !== null));
        // A short page is the last one: the rest would be empty and still billed.
        full = results.length >= SERPER_PAGE_SIZE;
        if (!full) break;
      }
      return { companies, more: full };
    },
  };
}
