// The crawl benchmark (docs/research/crawl-benchmark.md): crawls a fixed
// sample of company websites with the production crawler and reports how
// many end with an email. Run before and after every crawl change.
//
//   pnpm --filter @nvoke/server cli bench crawl --label baseline
//
// Responses are cached on disk (apps/server/.bench/http), so a re-run reads
// the same pages as the run before and a change is measured against the
// same web, not against a site that changed overnight. Pages a change asks
// for that no run asked for before are fetched live, through the same
// robots.txt rules and per host rate limit as the worker.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyAddress, domainOf } from '@nvoke/shared/crawl';
import { crawlSite, type CrawlResult } from '../leads/crawl.js';
import type { FetchLike } from '../leads/http.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { lookupMx, systemDns } from '../leads/verify/mx.js';

export type SampleSource = 'local' | 'web' | 'launches';

export interface SampleSite {
  source: SampleSource;
  /** The search that found it, for example "dentist in Aarhus". */
  query: string;
  name: string;
  website: string;
  domain: string;
}

export interface SiteResult {
  source: SampleSource;
  domain: string;
  status: CrawlResult['status'];
  emails: string[];
  generic: number;
  personal: number;
  /** Addresses whose domain has a mail server (MX, or an address record). */
  deliverable: number;
  /** How each address was found. */
  via: string[];
  pages: number;
  ms: number;
  error?: string;
}

// HTTP cache

interface CachedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

const KEPT_HEADERS = ['content-type', 'location', 'retry-after'];

/**
 * A fetch that answers from `dir` when the URL was fetched before and stores
 * what it fetches live. Network errors are cached too, so a dead site stays
 * dead across runs. `stats` counts hits and live fetches.
 */
export function cachingFetch(dir: string, live: FetchLike = fetch): { fetch: FetchLike; stats: { hits: number; live: number } } {
  mkdirSync(dir, { recursive: true });
  const stats = { hits: 0, live: 0 };
  const fileFor = (url: string) => join(dir, `${createHash('sha1').update(url).digest('hex')}.json`);

  const replay = (cached: CachedResponse): Response => {
    if (cached.error) throw new TypeError(`fetch failed: ${cached.error}`);
    const body = cached.status === 204 || cached.status === 304 ? null : Buffer.from(cached.body, 'base64');
    // Response only takes 200 to 599; a server answering 999 is still a refusal.
    const status = cached.status >= 200 && cached.status <= 599 ? cached.status : 599;
    return new Response(body, { status, headers: cached.headers });
  };

  const cachedFetch: FetchLike = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    if (method !== 'GET') return live(input, init);
    const file = fileFor(url);
    if (existsSync(file)) {
      stats.hits++;
      return replay(JSON.parse(readFileSync(file, 'utf8')) as CachedResponse);
    }
    stats.live++;
    let entry: CachedResponse;
    try {
      const res = await live(input, init);
      const body = Buffer.from(await res.arrayBuffer());
      const headers: Record<string, string> = {};
      for (const name of KEPT_HEADERS) {
        const value = res.headers.get(name);
        if (value !== null) headers[name] = value;
      }
      entry = { status: res.status, headers, body: body.toString('base64') };
    } catch (err) {
      // A page timeout is the site's answer and is kept; the bench's own per site deadline is not.
      if (init?.signal?.aborted && !(init.signal.reason instanceof DOMException && init.signal.reason.name === 'TimeoutError')) {
        throw err;
      }
      const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
      entry = { status: 0, headers: {}, body: '', error: (err instanceof Error ? err.message : String(err)) + (cause ? `: ${cause}` : '') };
    }
    writeFileSync(file, JSON.stringify(entry));
    return replay(entry);
  };
  return { fetch: cachedFetch, stats };
}

// Run

export interface BenchOptions {
  fetch?: FetchLike;
  concurrency?: number;
  /** Skips the MX lookups (tests). */
  mx?: boolean;
  onResult?: (result: SiteResult, done: number) => void;
}

/** Whether a domain has a mail server (MX, or an address record), one lookup per domain. */
export function mxChecker(): (domain: string) => Promise<boolean> {
  const dns = systemDns();
  const cache = new Map<string, Promise<boolean>>();
  return (domain) => {
    let hit = cache.get(domain);
    if (!hit) {
      hit = lookupMx(domain, dns).then((r) => r.kind === 'ok');
      cache.set(domain, hit);
    }
    return hit;
  };
}

export async function runCrawlBench(sample: SampleSite[], opts: BenchOptions = {}): Promise<SiteResult[]> {
  const limiter = new RateLimiter(1_000);
  const deps = { fetch: opts.fetch, limiter, robots: new RobotsCache({ fetch: opts.fetch, limiter }) };
  const hasMx = mxChecker();

  const results: SiteResult[] = new Array(sample.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= sample.length) return;
      const site = sample[i]!;
      const started = Date.now();
      let result: CrawlResult;
      // Not AbortSignal.timeout: its TimeoutError would look like a page timeout to cachingFetch.
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(new Error('site deadline')), 180_000);
      try {
        result = await crawlSite(site.website, site.domain, deps, { signal: deadline.signal });
      } catch (err) {
        result = { status: 'failed', emails: [], pages: [], texts: [], error: err instanceof Error ? err.message : String(err) };
      } finally {
        clearTimeout(timer);
      }
      const ms = Date.now() - started;
      const deliverable =
        opts.mx === false ? 0 : (await Promise.all(result.emails.map((e) => hasMx(domainOf(e.address))))).filter(Boolean).length;
      results[i] = {
        source: site.source,
        domain: site.domain,
        status: result.status,
        emails: result.emails.map((e) => e.address),
        generic: result.emails.filter((e) => e.kind === 'generic').length,
        personal: result.emails.filter((e) => e.kind === 'personal').length,
        deliverable,
        via: [...new Set(result.emails.map((e) => e.via))],
        pages: result.pages.filter((p) => p.note !== 'robots' && p.note !== 'budget').length,
        ms,
        ...(result.error ? { error: result.error } : {}),
      };
      opts.onResult?.(results[i], ++done);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency ?? 24) }, worker));
  return results;
}

// Report

export interface Summary {
  label: string;
  sites: number;
  status: Record<CrawlResult['status'], number>;
  /** Sites with at least one email. */
  withEmail: number;
  /** Sites with at least one email on a domain that takes mail. */
  withDeliverable: number;
  withGeneric: number;
  withPersonal: number;
  emails: number;
  avgPages: number;
  medianMs: number;
}

const STATUSES: Array<CrawlResult['status']> = ['done', 'failed', 'blocked', 'refused', 'js_only'];

export function summarize(label: string, results: SiteResult[]): Summary {
  const status = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Summary['status'];
  for (const r of results) status[r.status]++;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  return {
    label,
    sites: results.length,
    status,
    withEmail: results.filter((r) => r.emails.length > 0).length,
    withDeliverable: results.filter((r) => r.deliverable > 0).length,
    withGeneric: results.filter((r) => r.generic > 0).length,
    withPersonal: results.filter((r) => r.personal > 0).length,
    emails: results.reduce((n, r) => n + r.emails.length, 0),
    avgPages: results.length ? results.reduce((n, r) => n + r.pages, 0) / results.length : 0,
    medianMs: ms.length ? ms[Math.floor(ms.length / 2)]! : 0,
  };
}

function pct(n: number, of: number): string {
  return of === 0 ? '0%' : `${((100 * n) / of).toFixed(1)}%`;
}

/** One markdown table: a row per source and one for all. */
export function markdownTable(label: string, results: SiteResult[]): string {
  const groups: Array<[string, SiteResult[]]> = [
    ...(['local', 'web', 'launches'] as const).map((s): [string, SiteResult[]] => [s, results.filter((r) => r.source === s)]),
    ['all', results],
  ];
  const lines = [
    `| ${label} | sites | with email | deliverable | generic | personal | emails | done | failed | blocked | refused | js_only | pages | median s |`,
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ];
  for (const [name, rows] of groups) {
    if (rows.length === 0) continue;
    const s = summarize(name, rows);
    lines.push(
      `| ${name} | ${s.sites} | ${s.withEmail} (${pct(s.withEmail, s.sites)}) | ${s.withDeliverable} (${pct(s.withDeliverable, s.sites)}) | ${s.withGeneric} | ${s.withPersonal} | ${s.emails} | ${STATUSES.map((st) => s.status[st]).join(' | ')} | ${s.avgPages.toFixed(1)} | ${(s.medianMs / 1000).toFixed(1)} |`,
    );
  }
  return lines.join('\n');
}

/** Sites that gained or lost every email between two runs, for reading what a change did. */
export function diffRuns(before: SiteResult[], after: SiteResult[]): { gained: SiteResult[]; lost: SiteResult[] } {
  const prev = new Map(before.map((r) => [r.domain, r]));
  const gained: SiteResult[] = [];
  const lost: SiteResult[] = [];
  for (const r of after) {
    const p = prev.get(r.domain);
    if (!p) continue;
    if (p.emails.length === 0 && r.emails.length > 0) gained.push(r);
    if (p.emails.length > 0 && r.emails.length === 0) lost.push(r);
  }
  return { gained, lost };
}

// The desktop pass

/** One site read by the desktop's local render crawl (apps/desktop/src/main/local-crawl/bench.ts). */
export interface RenderResult {
  domain: string;
  outcome: 'done' | 'failed' | 'blocked';
  emails?: Array<{ address: string; sourceUrl: string | null }>;
  pages: number;
  ms: number;
}

/**
 * The server run with the desktop pass laid over it: a site the server found
 * no address on and `handed` lets through takes the desktop's addresses,
 * classified and MX checked like the server's own.
 */
export async function mergeRender(
  server: SiteResult[],
  render: RenderResult[],
  handed: (r: SiteResult) => boolean,
  hasMx: (domain: string) => Promise<boolean> = () => Promise.resolve(false),
): Promise<SiteResult[]> {
  const byDomain = new Map(render.map((r) => [r.domain, r]));
  return Promise.all(
    server.map(async (r) => {
      const local = byDomain.get(r.domain);
      if (r.emails.length > 0 || !local || !handed(r) || !local.emails?.length) return r;
      const emails = local.emails.map((e) => e.address);
      const kinds = emails.map(classifyAddress);
      return {
        ...r,
        emails,
        generic: kinds.filter((k) => k === 'generic').length,
        personal: kinds.filter((k) => k === 'personal').length,
        deliverable: (await Promise.all(emails.map((e) => hasMx(domainOf(e))))).filter(Boolean).length,
        via: ['desktop'],
        pages: r.pages + local.pages,
        ms: r.ms + local.ms,
      };
    }),
  );
}

/** What the desktop pass did, per server outcome of the sites it read. */
export function renderTable(server: SiteResult[], render: RenderResult[], handed: (r: SiteResult) => boolean): string {
  const byDomain = new Map(server.map((r) => [r.domain, r]));
  const lines = [
    '| server outcome | read | handed | done | failed | blocked | with email | emails | pages | median s |',
    '|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ];
  const rows = (status: string, list: RenderResult[]) => {
    if (list.length === 0) return;
    const ms = list.map((r) => r.ms).sort((a, b) => a - b);
    const count = (o: RenderResult['outcome']) => list.filter((r) => r.outcome === o).length;
    const handedCount = list.filter((r) => handed(byDomain.get(r.domain)!)).length;
    const pages = list.reduce((n, r) => n + r.pages, 0) / list.length;
    lines.push(
      `| ${status} | ${list.length} | ${handedCount} | ${count('done')} | ${count('failed')} | ${count('blocked')} | ${list.filter((r) => r.emails?.length).length} | ${list.reduce((n, r) => n + (r.emails?.length ?? 0), 0)} | ${pages.toFixed(1)} | ${(ms[Math.floor(ms.length / 2)]! / 1000).toFixed(1)} |`,
    );
  };
  const read = render.filter((r) => byDomain.has(r.domain));
  for (const status of STATUSES) rows(status === 'done' ? 'done, no email' : status, read.filter((r) => byDomain.get(r.domain)!.status === status));
  rows('all', read);
  return lines.join('\n');
}
