// Feed collectors (docs/SPEC.md, "Drops"). Each one lists what launched on
// its source since a given moment. They read only what the source publishes
// about a product and never crawl the product's site: that happens later,
// when a drop delivers the company to a user.

import type { Logger } from 'pino';
import type { FeedSource } from '@nvoke/shared';
import { hostToDomain, isPlatformDomain } from '../leads/domain.js';
import { fetchJson, type FetchLike } from '../leads/http.js';
import {
  ALGOLIA_SEARCH,
  PH_QUERY,
  PRODUCT_HUNT_GRAPHQL,
  parseShowHnTitle,
  resolvePhWebsite,
  type AlgoliaHit,
  type PhResponse,
} from '../leads/sources/launches.js';

export interface FeedItemInput {
  source: FeedSource;
  sourceRef: string;
  name: string;
  website: string;
  tagline?: string;
  description?: string;
  tags?: string[];
  location?: string;
  launchedAt?: Date;
}

export interface CollectContext {
  /** Collect launches after this moment. */
  since: Date;
  now: Date;
  signal: AbortSignal;
  log: Logger;
}

export interface FeedCollector {
  source: FeedSource;
  /** How often the worker runs it. */
  everyMs: number;
  /** False when the server lacks what the source needs, such as an API key. */
  available: boolean;
  collect(ctx: CollectContext): Promise<FeedItemInput[]>;
}

export interface CollectorOptions {
  productHuntToken: string | undefined;
  fetch?: FetchLike;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Plain text from an HN story_text, which is HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/** Links in an HN story_text, in order. */
export function storyLinks(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    out.push(m[1]!.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&'));
  }
  return out;
}

/** The first URL that looks like the company's own site. */
export function firstCompanySite(urls: Array<string | null | undefined>): string | null {
  for (const raw of urls) {
    if (!raw) continue;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
      const domain = hostToDomain(url.hostname);
      if (domain && !isPlatformDomain(domain) && !NOT_A_COMPANY_SITE.has(domain)) return url.toString();
    } catch {
      // not a URL
    }
  }
  return null;
}

/** Demo and scheduling hosts Launch HN posts link to before the product. */
const NOT_A_COMPANY_SITE = new Set(['loom.com', 'calendly.com', 'cal.com', 'docs.google.com', 'forms.gle', 'arxiv.org']);

// Hacker News: Show HN and Launch HN, through the Algolia API (no key).

interface FeedHit extends AlgoliaHit {
  story_text?: string | null;
  created_at_i?: number | null;
}

interface FeedAlgoliaResponse {
  hits?: FeedHit[];
  nbPages?: number;
}

const HN_PAGE_SIZE = 100;
const HN_MAX_PAGES = 10;
const DESCRIPTION_MAX = 1_000;

async function algoliaHits(tag: 'show_hn' | 'launch_hn', ctx: CollectContext, fetchImpl?: FetchLike): Promise<FeedHit[]> {
  const since = Math.floor(ctx.since.getTime() / 1000);
  const hits: FeedHit[] = [];
  for (let page = 0; page < HN_MAX_PAGES; page++) {
    const url = new URL(ALGOLIA_SEARCH);
    url.searchParams.set('tags', tag);
    url.searchParams.set('hitsPerPage', String(HN_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('numericFilters', `created_at_i>${since}`);
    const res = await fetchJson<FeedAlgoliaResponse>(url.toString(), { fetch: fetchImpl, signal: ctx.signal, timeoutMs: 20_000 });
    hits.push(...(res.hits ?? []));
    if ((res.hits ?? []).length === 0 || page + 1 >= (res.nbPages ?? 0)) break;
  }
  return hits;
}

function hitDate(hit: FeedHit): Date | undefined {
  if (typeof hit.created_at_i === 'number') return new Date(hit.created_at_i * 1000);
  const d = hit.created_at ? new Date(hit.created_at) : null;
  return d && !Number.isNaN(d.getTime()) ? d : undefined;
}

function hitDescription(hit: FeedHit): string | undefined {
  const text = hit.story_text ? htmlToText(hit.story_text).slice(0, DESCRIPTION_MAX) : '';
  return text || undefined;
}

export function showHnItem(hit: FeedHit): FeedItemInput | null {
  const title = (hit.title ?? '').trim();
  // A text-only Show HN has no site of its own.
  const website = firstCompanySite([hit.url]);
  if (!hit.objectID || !title || !website) return null;
  const { name, tagline } = parseShowHnTitle(title);
  return {
    source: 'show_hn',
    sourceRef: hit.objectID,
    name,
    website,
    tagline: tagline ?? undefined,
    description: hitDescription(hit),
    launchedAt: hitDate(hit),
  };
}

const LAUNCH_HN_PREFIX = /^\s*launch\s*hn\s*[:\u2013\u2014\u2015-]\s*/i;
const YC_BATCH = /\s*\((YC\s+[A-Z]\d{2})\)\s*/i;

/** Name, YC batch and tagline from a Launch HN title such as "Launch HN: Consus (YC F24): LLM gateway". */
export function parseLaunchHnTitle(rawTitle: string): { name: string; batch: string | null; tagline: string | null } {
  const stripped = rawTitle.replace(LAUNCH_HN_PREFIX, '');
  const batch = YC_BATCH.exec(stripped)?.[1]?.replace(/\s+/, ' ').toUpperCase() ?? null;
  const { name, tagline } = parseShowHnTitle(stripped.replace(YC_BATCH, ' ').trim());
  return { name, batch, tagline };
}

/** Launch HN posts often have no URL, only links in the text. */
export function launchHnItem(hit: FeedHit): FeedItemInput | null {
  const title = (hit.title ?? '').trim();
  const website = firstCompanySite([hit.url, ...storyLinks(hit.story_text ?? '')]);
  if (!hit.objectID || !title || !website) return null;
  const { name, batch, tagline } = parseLaunchHnTitle(title);
  return {
    source: 'launch_hn',
    sourceRef: hit.objectID,
    name,
    website,
    tagline: tagline ?? undefined,
    description: hitDescription(hit),
    tags: batch ? [batch] : [],
    launchedAt: hitDate(hit),
  };
}

function hnCollector(tag: 'show_hn' | 'launch_hn', opts: CollectorOptions): FeedCollector {
  const toItem = tag === 'show_hn' ? showHnItem : launchHnItem;
  return {
    source: tag,
    everyMs: 30 * MINUTE,
    available: true,
    async collect(ctx) {
      const hits = await algoliaHits(tag, ctx, opts.fetch);
      return hits.map(toItem).filter((i): i is FeedItemInput => i !== null);
    },
  };
}

// Product Hunt (GraphQL v2, needs PRODUCT_HUNT_TOKEN).

const PH_PAGE_SIZE = 20;
const PH_MAX_PAGES = 15;

function productHuntCollector(opts: CollectorOptions): FeedCollector {
  return {
    source: 'product_hunt',
    everyMs: HOUR,
    available: Boolean(opts.productHuntToken),
    async collect(ctx) {
      const token = opts.productHuntToken;
      if (!token) return [];
      const items: FeedItemInput[] = [];
      let after: string | null = null;
      for (let page = 0; page < PH_MAX_PAGES; page++) {
        const res: PhResponse = await fetchJson<PhResponse>(PRODUCT_HUNT_GRAPHQL, {
          fetch: opts.fetch,
          method: 'POST',
          signal: ctx.signal,
          timeoutMs: 20_000,
          body: JSON.stringify({ query: PH_QUERY, variables: { postedAfter: ctx.since.toISOString(), first: PH_PAGE_SIZE, after } }),
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        });
        if (res.errors?.length) throw new Error(`product hunt: ${res.errors.map((e) => e?.message ?? '?').join('; ')}`);
        const posts = res.data?.posts;
        for (const edge of posts?.edges ?? []) {
          const node = edge?.node;
          if (!node?.id || !node.name || !node.website) continue;
          const website = await resolvePhWebsite(node.website, opts.fetch, ctx.signal);
          if (!website) continue;
          items.push({
            source: 'product_hunt',
            sourceRef: node.id,
            name: node.name.trim(),
            website,
            tagline: node.tagline?.trim() || undefined,
            description: node.description?.trim().slice(0, DESCRIPTION_MAX) || undefined,
            tags: (node.topics?.edges ?? []).map((e) => e?.node?.name?.trim() ?? '').filter(Boolean),
          });
        }
        if (!posts?.pageInfo?.hasNextPage || !posts.pageInfo.endCursor) break;
        after = posts.pageInfo.endCursor;
      }
      return items;
    },
  };
}

// Y Combinator, through the public yc-oss mirror of the YC company directory.

export const YC_META = 'https://yc-oss.github.io/api/meta.json';
/** Only the newest batches count as fresh. */
const YC_BATCHES = 3;
const SEASONS: Record<string, number> = { winter: 0, spring: 1, summer: 2, fall: 3 };

interface YcMeta {
  batches?: Record<string, { name?: string; count?: number; api?: string }>;
}

interface YcCompany {
  id?: number;
  slug?: string;
  name?: string;
  website?: string | null;
  one_liner?: string | null;
  long_description?: string | null;
  all_locations?: string | null;
  tags?: string[];
  batch?: string | null;
  status?: string | null;
}

/** The newest batch keys, such as "fall-2026", ignoring "unspecified". */
export function newestYcBatches(keys: string[], n = YC_BATCHES): string[] {
  const rank = (key: string): number | null => {
    const m = /^(winter|spring|summer|fall)-(\d{4})$/.exec(key);
    return m ? Number(m[2]) * 4 + SEASONS[m[1]!]! : null;
  };
  return keys
    .map((key) => ({ key, rank: rank(key) }))
    .filter((b): b is { key: string; rank: number } => b.rank !== null)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, n)
    .map((b) => b.key);
}

export function ycItem(c: YcCompany): FeedItemInput | null {
  const website = firstCompanySite([c.website]);
  if (!c.slug || !c.name || !website || (c.status && c.status !== 'Active')) return null;
  return {
    source: 'yc',
    sourceRef: c.slug,
    name: c.name.trim(),
    website,
    tagline: c.one_liner?.trim() || undefined,
    description: c.long_description?.trim().slice(0, DESCRIPTION_MAX) || undefined,
    tags: [...(c.tags ?? []), ...(c.batch ? [c.batch] : [])],
    location: c.all_locations?.trim() || undefined,
  };
}

function ycCollector(opts: CollectorOptions): FeedCollector {
  return {
    source: 'yc',
    // The directory changes a few times a day at most.
    everyMs: 6 * HOUR,
    available: true,
    async collect(ctx) {
      // YC publishes no launch dates worth trusting, so `since` is not used:
      // every company in the newest batches is listed and the unique
      // (source, source_ref) keeps the ones already collected out.
      const meta = await fetchJson<YcMeta>(YC_META, { fetch: opts.fetch, signal: ctx.signal, timeoutMs: 20_000 });
      const batches = meta.batches ?? {};
      const items: FeedItemInput[] = [];
      for (const key of newestYcBatches(Object.keys(batches))) {
        const api = batches[key]?.api;
        if (!api) continue;
        const companies = await fetchJson<YcCompany[]>(api, {
          fetch: opts.fetch,
          signal: ctx.signal,
          timeoutMs: 30_000,
          maxBytes: 10_000_000,
        });
        for (const c of Array.isArray(companies) ? companies : []) {
          const item = ycItem(c);
          if (item) items.push(item);
        }
      }
      return items;
    },
  };
}

export function createCollectors(opts: CollectorOptions): FeedCollector[] {
  return [hnCollector('show_hn', opts), hnCollector('launch_hn', opts), productHuntCollector(opts), ycCollector(opts)];
}

/** Which sources these collectors can read. */
export function sourceAvailability(collectors: FeedCollector[]): Record<FeedSource, boolean> {
  return Object.fromEntries(collectors.map((c) => [c.source, c.available])) as Record<FeedSource, boolean>;
}
