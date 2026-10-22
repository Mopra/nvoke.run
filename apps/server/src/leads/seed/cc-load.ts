// Loads Common Crawl homepages into the company index
// (docs/research/common-crawl-index.md, "Verdict"). Two steps, both run from
// `cli cc`:
//
// - ccList reads the crawl's CDX index (whole shards, or random blocks of it
//   for a trial) and lists every registrable domain the seed filter keeps
//   that has a readable homepage capture, with its best contact and about
//   captures for a later pass.
// - ccLoad fetches the listed homepages by HTTP range, drops the parked,
//   walled and empty ones and writes title, description and the first
//   CC_TEXT_MAX characters of text into domain_pages, with a domains row due
//   for a recrawl at once (a search that picks the company still crawls it
//   live) and an index_imports row (1850_index_imports). No LLM pass: fit
//   scoring judges each company per search.
//
// data.commoncrawl.org answered 403 to everything for minutes after a run at
// 12 requests at once, so requests are paced (CC_RATE a second) and a 403 or
// 503 pauses every request for a while.

import { createGunzip, gunzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { Sql } from 'postgres';
import { pageWall } from '@nvoke/shared/crawl';
import { pageText } from '../page-text.js';
import { isParkedPage } from '../sources/resolve-name.js';
import { domainHash } from '../suppression.js';
import { CC_DATA, CC_USER_AGENT, domainGroups, parseClusterLine, pickPages, warcHtml, type Capture, type CaptureRef, type IndexBlock, type ListedDomain } from './common-crawl.js';
import { seedSkipReason } from './filter.js';

/** index_imports.source of a Common Crawl row. */
export const CC_SOURCE = 'common_crawl';
/** Requests a second at most: 4 at once ran at 11 to 32 a second with few retries. */
export const CC_RATE = 20;
/** Requests at once. */
export const CC_CONCURRENCY = 4;
/** Characters of homepage text kept: lifts the fit gate's strong share from 75% to 89%. */
export const CC_TEXT_MAX = 600;
/** Domains checked, fetched and written at once. */
const BATCH = 200;
/** Tries per request before it counts as failed. */
const ATTEMPTS = 6;
/** First pause after a 403, doubled each time up to MAX_BLOCKED_PAUSE_MS. */
const BLOCKED_PAUSE_MS = 60_000;
const MAX_BLOCKED_PAUSE_MS = 15 * 60_000;
const REQUEST_TIMEOUT_MS = 60_000;

export interface FetcherStats {
  requests: number;
  bytes: number;
  retries: number;
  /** 403 answers: each paused every request. */
  blocked: number;
}

export interface CcFetcherOptions {
  /** Requests a second at most. */
  rate?: number;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

/** Paced requests to data.commoncrawl.org, shared by every worker of a run. */
export class CcFetcher {
  readonly stats: FetcherStats = { requests: 0, bytes: 0, retries: 0, blocked: 0 };
  private readonly gap: number;
  private readonly fetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: (line: string) => void;
  private nextSlot = 0;
  private pausedUntil = 0;
  private blockedPause = BLOCKED_PAUSE_MS;

  constructor(opts: CcFetcherOptions = {}) {
    this.gap = 1000 / (opts.rate ?? CC_RATE);
    this.fetch = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.log = opts.log ?? (() => {});
  }

  /** Waits for this request's turn: the pace, and any pause a 403 or 503 set. */
  private async turn(): Promise<void> {
    for (;;) {
      const now = Date.now();
      const at = Math.max(now, this.nextSlot, this.pausedUntil);
      if (at <= now) {
        this.nextSlot = now + this.gap;
        return;
      }
      await this.sleep(at - now);
    }
  }

  /**
   * A paced, retried request. It is dropped after REQUEST_TIMEOUT_MS of
   * silence, not of the whole answer (a shard streams for many minutes): call
   * `touch` on each chunk read and `done` when the body is read.
   */
  private async get(path: string, range?: { offset: number; length: number }): Promise<{ res: Response; touch: () => void; done: () => void }> {
    for (let attempt = 1; ; attempt++) {
      await this.turn();
      let status = 0;
      const abort = new AbortController();
      let timer: NodeJS.Timeout | undefined;
      const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(() => abort.abort(new Error(`nothing for ${REQUEST_TIMEOUT_MS / 1000} s from ${path}`)), REQUEST_TIMEOUT_MS);
      };
      const done = () => clearTimeout(timer);
      touch();
      try {
        const res = await this.fetch(CC_DATA + path, {
          headers: { 'User-Agent': CC_USER_AGENT, ...(range && { Range: `bytes=${range.offset}-${range.offset + range.length - 1}` }) },
          signal: abort.signal,
        });
        status = res.status;
        if (res.ok) {
          this.stats.requests++;
          this.blockedPause = BLOCKED_PAUSE_MS;
          touch();
          return { res, touch, done };
        }
        done();
        await res.body?.cancel();
        // A missing file is not worth retrying.
        if (status === 404 || status === 416) throw Object.assign(new Error(`${status} for ${path}`), { final: true });
      } catch (err) {
        done();
        if ((err as { final?: boolean }).final || attempt >= ATTEMPTS) throw err;
      }
      if (attempt >= ATTEMPTS) throw new Error(`${status} for ${path}`);
      this.stats.retries++;
      if (status === 403) {
        this.stats.blocked++;
        // The other requests in flight get their 403 too: one burst is one pause.
        if (Date.now() >= this.pausedUntil) {
          this.log(`403 from Common Crawl: pausing ${Math.round(this.blockedPause / 1000)} s`);
          this.pausedUntil = Date.now() + this.blockedPause;
          this.blockedPause = Math.min(this.blockedPause * 2, MAX_BLOCKED_PAUSE_MS);
        }
      } else {
        // 503, 5xx or a dropped connection: everyone slows down a little.
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + 1000 * 2 ** attempt);
      }
    }
  }

  /** Bytes [offset, offset + length) of a file. */
  async range(path: string, offset: number, length: number): Promise<Buffer> {
    const { res, done } = await this.get(path, { offset, length });
    try {
      const buf = Buffer.from(await res.arrayBuffer());
      this.stats.bytes += buf.length;
      return buf;
    } finally {
      done();
    }
  }

  /** A whole text file. */
  async text(path: string): Promise<string> {
    const { res, done } = await this.get(path);
    try {
      const body = await res.text();
      this.stats.bytes += body.length;
      return body;
    } finally {
      done();
    }
  }

  /** The lines of a gzipped file, streamed. A dropped or stalled stream throws from the loop. */
  async *gzipLines(path: string): AsyncGenerator<string> {
    const { res, touch, done } = await this.get(path);
    const input = Readable.fromWeb(res.body as WebReadableStream);
    const gunzip = createGunzip();
    // pipe() does not carry errors: without this a dropped stream ends the process, not the loop.
    input.on('error', (err) => gunzip.destroy(err));
    input.on('data', (chunk: Buffer) => {
      this.stats.bytes += chunk.length;
      touch();
    });
    input.pipe(gunzip);
    let rest = '';
    try {
      for await (const chunk of gunzip as AsyncIterable<Buffer>) {
        const lines = (rest + chunk.toString('utf8')).split('\n');
        rest = lines.pop()!;
        yield* lines;
      }
      if (rest) yield rest;
    } finally {
      done();
      input.destroy();
    }
  }
}

const indexPath = (crawl: string, file: string) => `cc-index/collections/${crawl}/indexes/${file}`;

/** Runs `fn` over `items`, `size` at a time. */
async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CcListStats {
  /** Registrable domains read. */
  domains: number;
  /** Turned down by the seed filter. */
  filtered: number;
  /** No readable homepage capture. */
  noHomepage: number;
  listed: number;
}

export interface CcListOptions {
  crawl: string;
  fetcher: CcFetcher;
  /** Whole shards to read, by name (cdx-00150.gz). */
  shards?: string[];
  /** Or this many random blocks of the index (cluster.idx), for a trial load spread over every TLD. */
  blocks?: number;
  /** Seed of the block draw. */
  seed?: number;
  /** Takes each listed domain, in index order within a shard or block. */
  write: (d: ListedDomain) => void | Promise<void>;
  log?: (line: string) => void;
}

/** Lists the domains of a crawl worth loading (see the top of this file). */
export async function ccList(opts: CcListOptions): Promise<CcListStats> {
  const stats: CcListStats = { domains: 0, filtered: 0, noHomepage: 0, listed: 0 };
  const log = opts.log ?? (() => {});
  /** The listed domains of one stream of groups, written once the stream is read whole. */
  const read = async (groups: AsyncIterable<{ domain: string; captures: Capture[] }>, dropEnds: boolean) => {
    const out: ListedDomain[] = [];
    const counts = { domains: 0, filtered: 0, noHomepage: 0 };
    const pick = (g: { domain: string; captures: Capture[] }) => {
      counts.domains++;
      if (seedSkipReason(g.domain)) counts.filtered++;
      else {
        const picked = pickPages(g.domain, g.captures);
        if (picked) out.push(picked);
        else counts.noHomepage++;
      }
    };
    // A block's first and last domain may go on in the next block: they are read with it, never twice.
    let prev: { domain: string; captures: Capture[] } | null = null;
    let first = true;
    for await (const g of groups) {
      if (prev && !(dropEnds && first)) pick(prev);
      if (prev) first = false;
      prev = g;
    }
    if (prev && !dropEnds) pick(prev);
    return { out, counts };
  };
  const take = async ({ out, counts }: Awaited<ReturnType<typeof read>>) => {
    stats.domains += counts.domains;
    stats.filtered += counts.filtered;
    stats.noHomepage += counts.noHomepage;
    for (const d of out) await opts.write(d);
    stats.listed += out.length;
  };

  if (opts.shards) {
    for (const shard of opts.shards) {
      // A shard is about 827 MB: a broken stream reads it again rather than list half of it.
      for (let attempt = 1; ; attempt++) {
        try {
          await take(await read(domainGroups(opts.fetcher.gzipLines(indexPath(opts.crawl, shard)), seedSkipReason), false));
          break;
        } catch (err) {
          if (attempt >= 3) throw err;
          log(`${shard}: ${(err as Error).message}, reading it again`);
        }
      }
      log(`${shard}: ${stats.listed} listed of ${stats.domains} domains so far`);
    }
    return stats;
  }

  const cluster = (await opts.fetcher.text(indexPath(opts.crawl, 'cluster.idx'))).trim().split('\n');
  const rand = mulberry32(opts.seed ?? 1);
  const chosen = new Set<number>();
  const want = Math.min(opts.blocks ?? 0, cluster.length);
  while (chosen.size < want) chosen.add(Math.floor(rand() * cluster.length));
  const blocks = [...chosen].sort((a, b) => a - b).map((i) => parseClusterLine(cluster[i]!)).filter((b): b is IndexBlock => b !== null);
  let done = 0;
  await pool(blocks, CC_CONCURRENCY, async (b) => {
    const gz = await opts.fetcher.range(indexPath(opts.crawl, b.shard), b.offset, b.length);
    await take(await read(domainGroups(gunzipSync(gz).toString('utf8').split('\n'), seedSkipReason), true));
    if (++done % 100 === 0) log(`${done} of ${blocks.length} blocks: ${stats.listed} listed of ${stats.domains} domains`);
  });
  return stats;
}

export type DropReason = 'parked' | 'wall' | 'empty' | 'not_html';

/** Hosting defaults and placeholders: a homepage like this says nothing about a company. */
const PLACEHOLDER = /coming soon|under construction|website is under|site en construction|default (web )?page|it works!|welcome to nginx|index of \/|future home of|domain (is )?for sale|account suspended/i;
/** Bot walls pageWall does not know, as the crawler saw them: a short page and nothing else. */
const SHORT_WALL = /one moment, please|request is being verified|enable javascript and cookies to continue/i;
/** Text a homepage needs when it has no title, or reads like a placeholder. */
const MIN_TEXT = 200;

export interface HomeHead {
  url: string;
  title: string;
  description: string;
  text: string;
}

/** What the index keeps of a homepage, or why it is dropped. */
export function homeHead(html: string, url: string): HomeHead | { drop: DropReason } {
  if (!/<(html|body|title|head|div|p)\b/i.test(html.slice(0, 20_000))) return { drop: 'not_html' };
  if (isParkedPage(html)) return { drop: 'parked' };
  if (pageWall(html)) return { drop: 'wall' };
  const page = pageText(html, url, CC_TEXT_MAX);
  const short = page.text.length < MIN_TEXT;
  if (short && SHORT_WALL.test(`${page.title}
${page.text}`)) return { drop: 'wall' };
  if (short && (!page.title || PLACEHOLDER.test(`${page.title}\n${page.text}`))) return { drop: 'empty' };
  return page;
}

export interface CcLoadStats {
  /** List lines read, those passed over on a resumed run included. */
  read: number;
  /** In the index already (a crawl or an earlier load) or suppressed. */
  known: number;
  /** The homepage record could not be fetched or read. */
  failed: number;
  dropped: Record<DropReason, number>;
  added: number;
}

export interface CcLoadOptions {
  crawl: string;
  fetcher: CcFetcher;
  /**
   * Stop once this many domains were added. The batch that reaches it is
   * written whole, so a resumed run loses nothing it fetched.
   */
  limit: number;
  /** List lines handled by an earlier run, passed over. */
  skip?: number;
  /** Domains checked, fetched and written at once. Default BATCH. */
  batch?: number;
  concurrency?: number;
  /** Called after each batch with the list lines handled so far, to resume from. */
  onProgress?: (stats: CcLoadStats) => void | Promise<void>;
  now?: () => Date;
}

/** Loads listed homepages into the company index (see the top of this file). */
export async function ccLoad(sql: Sql, list: AsyncIterable<ListedDomain> | Iterable<ListedDomain>, opts: CcLoadOptions): Promise<CcLoadStats> {
  const stats: CcLoadStats = { read: 0, known: 0, failed: 0, dropped: { parked: 0, wall: 0, empty: 0, not_html: 0 }, added: 0 };
  let batch: ListedDomain[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    // A domain whose captures straddle two shards, or one with a port, is listed twice: once is enough.
    const listed = batch.length;
    batch = [...new Map(batch.map((d) => [d.domain, d])).values()];
    stats.known += listed - batch.length;
    const domains = batch.map((d) => d.domain);
    const hashes = new Map(domains.map((d) => [domainHash(d), d]));
    const [inIndex, suppressed] = await Promise.all([
      sql<{ domain: string }[]>`select domain from domains where domain = any(${domains}::text[])`,
      sql<{ hash: string }[]>`select hash from suppressions where kind = 'domain' and hash = any(${[...hashes.keys()]}::text[])`,
    ]);
    const skip = new Set([...inIndex.map((r) => r.domain), ...suppressed.map((r) => hashes.get(r.hash)!)]);
    const fresh = batch.filter((d) => !skip.has(d.domain));
    stats.known += batch.length - fresh.length;

    const heads: Array<{ d: ListedDomain; head: HomeHead }> = [];
    await pool(fresh, opts.concurrency ?? CC_CONCURRENCY, async (d) => {
      const head = await fetchHome(opts.fetcher, d.home).catch(() => null);
      if (!head) stats.failed++;
      else if ('drop' in head) stats.dropped[head.drop]++;
      else heads.push({ d, head });
    });
    if (heads.length > 0) stats.added += await writeRows(sql, opts.crawl, heads, opts.now?.() ?? new Date());
    batch = [];
    await opts.onProgress?.(stats);
  };

  for await (const d of list) {
    stats.read++;
    if (stats.read <= (opts.skip ?? 0)) continue;
    batch.push(d);
    if (batch.length >= (opts.batch ?? BATCH)) await flush();
    if (stats.added >= opts.limit) break;
  }
  await flush();
  return stats;
}

async function fetchHome(fetcher: CcFetcher, home: CaptureRef): Promise<HomeHead | { drop: DropReason } | null> {
  const html = warcHtml(await fetcher.range(home.filename, home.offset, home.length));
  return html === null ? null : homeHead(html, home.url);
}

/** Writes one batch. A domain a search crawled meanwhile keeps its crawl. Rows written. */
async function writeRows(sql: Sql, crawl: string, rows: Array<{ d: ListedDomain; head: HomeHead }>, now: Date): Promise<number> {
  return sql.begin(async (tx) => {
    // Captured weeks ago at most, and due at once: the page feeds the index, a search still crawls the site.
    const domains = rows.map(({ d }) => ({ domain: d.domain, crawl_status: 'done', crawled_at: d.home.at, has_personal: false, recheck_at: d.home.at }));
    const inserted = await tx<{ domain: string }[]>`
      insert into domains ${tx(domains, 'domain', 'crawl_status', 'crawled_at', 'has_personal', 'recheck_at')}
      on conflict (domain) do nothing
      returning domain
    `;
    const fresh = new Set(inserted.map((r) => r.domain));
    const kept = rows.filter(({ d }) => fresh.has(d.domain));
    if (kept.length === 0) return 0;
    const pages = kept.map(({ d, head }) => ({ domain: d.domain, url: head.url, title: head.title, description: head.description, text: head.text, fetched_at: d.home.at }));
    await tx`insert into domain_pages ${tx(pages, 'domain', 'url', 'title', 'description', 'text', 'fetched_at')}`;
    const imports = kept.map(({ d }) => ({ domain: d.domain, source: CC_SOURCE, crawl, loaded_at: now.toISOString() }));
    await tx`insert into index_imports ${tx(imports, 'domain', 'source', 'crawl', 'loaded_at')}`;
    return kept.length;
  });
}

/** Rows each load added, per crawl. */
export async function ccLoaded(sql: Sql): Promise<Array<{ crawl: string; domains: number; last: Date }>> {
  return sql<Array<{ crawl: string; domains: number; last: Date }>>`
    select crawl, count(*)::int as domains, max(loaded_at) as last
    from index_imports where source = ${CC_SOURCE}
    group by crawl order by crawl
  `;
}
