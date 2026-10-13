// New launches: Show HN (Algolia Hacker News API, no key) and Product Hunt
// (GraphQL v2, needs PRODUCT_HUNT_TOKEN). Ported from probe's
// apps/worker/src/sources/show-hn.ts and product-hunt.ts.
//
// Without a Product Hunt token the search still runs on Show HN alone and
// logs a warning, unless the user asked for Product Hunt only, which fails
// with a clear error.

import type { LaunchesSearchParams, LaunchSource } from '@nvoke/shared';
import { hostToDomain } from '../domain.js';
import { fetchCapped, fetchJson, type FetchLike } from '../http.js';
import { PermanentError, type FoundCompany, type SourceAdapter, type SourceContext } from './types.js';

export const ALGOLIA_SEARCH = 'https://hn.algolia.com/api/v1/search_by_date';
export const PRODUCT_HUNT_GRAPHQL = 'https://api.producthunt.com/v2/api/graphql';

export interface LaunchesAdapterOptions {
  productHuntToken: string | undefined;
  fetch?: FetchLike;
  now?: () => Date;
}

// Show HN

interface AlgoliaHit {
  objectID?: string;
  title?: string | null;
  url?: string | null;
  created_at?: string | null;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
  nbPages?: number;
}

/** Separators HN titles use between a product name and its tagline (en dash, em dash, bar, hyphen, colon, pipe). */
const TITLE_SEPARATOR = /\s+[\u2013\u2014\u2015-]\s+|\s*[:|]\s+/;
const SHOW_HN_PREFIX = /^\s*show\s*hn\s*[:\u2013\u2014\u2015-]\s*/i;

/** Strips the "Show HN:" prefix and any trailing tagline, so the name is the product name. */
export function parseShowHnTitle(rawTitle: string): { name: string; tagline: string | null } {
  const stripped = rawTitle.replace(SHOW_HN_PREFIX, '').trim();
  if (!stripped) return { name: rawTitle.trim(), tagline: null };
  const match = TITLE_SEPARATOR.exec(stripped);
  if (!match || match.index === 0) return { name: stripped, tagline: null };
  const name = stripped.slice(0, match.index).trim();
  const tagline = stripped.slice(match.index + match[0].length).trim();
  if (!name) return { name: stripped, tagline: null };
  return { name, tagline: tagline || null };
}

export function hitToCompany(hit: AlgoliaHit): FoundCompany | null {
  const id = hit.objectID;
  const title = (hit.title ?? '').trim();
  const url = (hit.url ?? '').trim();
  // A text-only Show HN has no website to crawl.
  if (!id || !title || !url) return null;
  const { name, tagline } = parseShowHnTitle(title);
  return { name, website: url, source: 'show_hn', sourceRef: id, category: tagline ?? undefined };
}

const HN_PAGE_SIZE = 100;
const HN_MAX_PAGES = 10;

async function* showHn(
  params: LaunchesSearchParams,
  ctx: SourceContext,
  opts: LaunchesAdapterOptions,
): AsyncGenerator<FoundCompany> {
  const now = (opts.now ?? (() => new Date()))();
  const since = Math.floor(now.getTime() / 1000) - params.days * 86_400;
  for (let page = 0; page < HN_MAX_PAGES; page++) {
    const url = new URL(ALGOLIA_SEARCH);
    url.searchParams.set('tags', 'show_hn');
    url.searchParams.set('hitsPerPage', String(HN_PAGE_SIZE));
    url.searchParams.set('page', String(page));
    url.searchParams.set('numericFilters', `created_at_i>${since}`);
    if (params.keyword) url.searchParams.set('query', params.keyword);
    const res = await fetchJson<AlgoliaResponse>(url.toString(), { fetch: opts.fetch, signal: ctx.signal, timeoutMs: 20_000 });
    for (const hit of res.hits ?? []) {
      const company = hitToCompany(hit);
      if (company) yield company;
    }
    if ((res.hits ?? []).length === 0 || page + 1 >= (res.nbPages ?? 0)) return;
  }
}

// Product Hunt

const PH_QUERY = `
query NvokePosts($postedAfter: DateTime!, $first: Int!, $after: String) {
  posts(order: NEWEST, postedAfter: $postedAfter, first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        name
        tagline
        description
        website
        url
        topics { edges { node { name } } }
      }
    }
  }
}`.trim();

export interface PhNode {
  id?: string;
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
  website?: string | null;
  url?: string | null;
  topics?: { edges?: Array<{ node?: { name?: string | null } }> };
}

interface PhResponse {
  data?: {
    posts?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
      edges?: Array<{ node?: PhNode }>;
    };
  };
  errors?: Array<{ message?: string }>;
}

export function phMatches(node: PhNode, keyword: string | undefined): boolean {
  if (!keyword) return true;
  const topics = (node.topics?.edges ?? []).map((e) => e?.node?.name ?? '').join(' ');
  const haystack = `${node.name ?? ''} ${node.tagline ?? ''} ${node.description ?? ''} ${topics}`.toLowerCase();
  return keyword
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/**
 * A Product Hunt post's `website` is a redirect through producthunt.com.
 * Follow it to learn the real site; keep the original when it does not leave
 * producthunt.com.
 */
export async function resolvePhWebsite(website: string, fetchImpl?: FetchLike, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetchCapped(website, { fetch: fetchImpl, signal, timeoutMs: 10_000, maxBytes: 1 });
    const host = hostToDomain(new URL(res.url).hostname);
    if (!host || host.endsWith('producthunt.com')) return null;
    return res.url;
  } catch {
    return null;
  }
}

const PH_PAGE_SIZE = 20;
const PH_MAX_PAGES = 10;

async function* productHunt(
  params: LaunchesSearchParams,
  ctx: SourceContext,
  opts: LaunchesAdapterOptions,
): AsyncGenerator<FoundCompany> {
  const token = opts.productHuntToken;
  if (!token) return;
  const now = (opts.now ?? (() => new Date()))();
  const postedAfter = new Date(now.getTime() - params.days * 86_400_000).toISOString();
  let after: string | null = null;
  for (let page = 0; page < PH_MAX_PAGES; page++) {
    const res: PhResponse = await fetchJson<PhResponse>(PRODUCT_HUNT_GRAPHQL, {
      fetch: opts.fetch,
      method: 'POST',
      signal: ctx.signal,
      timeoutMs: 20_000,
      body: JSON.stringify({ query: PH_QUERY, variables: { postedAfter, first: PH_PAGE_SIZE, after } }),
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    });
    if (res.errors?.length) {
      throw new Error(`product hunt: ${res.errors.map((e) => e?.message ?? '?').join('; ')}`);
    }
    const posts = res.data?.posts;
    for (const edge of posts?.edges ?? []) {
      const node = edge?.node;
      if (!node?.id || !node.name || !node.website || !phMatches(node, params.keyword)) continue;
      const website = await resolvePhWebsite(node.website, opts.fetch, ctx.signal);
      if (!website) continue;
      yield {
        name: node.name.trim(),
        website,
        source: 'product_hunt',
        sourceRef: node.id,
        category: node.tagline?.trim() || undefined,
      };
    }
    if (!posts?.pageInfo?.hasNextPage || !posts.pageInfo.endCursor) return;
    after = posts.pageInfo.endCursor;
  }
}

export function launchesAdapter(opts: LaunchesAdapterOptions): SourceAdapter<LaunchesSearchParams> {
  return {
    kind: 'launches',
    async *find(params, ctx) {
      const wanted: LaunchSource[] = params.sources ?? ['show_hn', 'product_hunt'];
      if (wanted.includes('product_hunt') && !opts.productHuntToken) {
        if (wanted.length === 1) {
          throw new PermanentError(
            'Product Hunt is not configured on this server (PRODUCT_HUNT_TOKEN is not set)',
            'source_not_configured',
          );
        }
        ctx.log.warn('launches: PRODUCT_HUNT_TOKEN is not set, using Show HN only');
      }
      // Interleave so a small limit still gets launches from both sources.
      const iterators: AsyncIterator<FoundCompany>[] = [];
      if (wanted.includes('show_hn')) iterators.push(showHn(params, ctx, opts));
      if (wanted.includes('product_hunt') && opts.productHuntToken) iterators.push(productHunt(params, ctx, opts));
      try {
        while (iterators.length > 0) {
          for (let i = 0; i < iterators.length; ) {
            const it = iterators[i]!;
            const next = await it.next();
            if (next.done) {
              iterators.splice(i, 1);
              continue;
            }
            yield next.value;
            i++;
          }
        }
      } finally {
        await Promise.all(iterators.map((it) => it.return?.()));
      }
    },
  };
}
