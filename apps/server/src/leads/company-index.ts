// Our own company index (docs/research/cost.md, lever 1; migration
// 1720_company_index). Every domain a crawl read keeps the text of up to 3
// pages in domain_pages, and the feed collectors keep launches in feed_items;
// both carry a full text vector. A "Describe your customer" search asks the
// index with its plan's own words before each tier it pays web search for
// (sources/icp.ts), and the candidates go through the same fit scoring as
// web results. A page need not hold every word of a query: any MIN_MATCHED of
// the plan's words make a candidate, and more words rank higher. A candidate
// whose homepage is kept comes with its title and meta description, so fit
// scoring never fetches it again.
//
// Only company data is served: the vectors never hold an address (the
// migration cuts them out), snippets are cut the same way, and suppressed
// domains and domains whose last crawl failed, was blocked or was refused
// never come back.

import type { Sql } from 'postgres';
import { registrableDomain } from './domain.js';
import type { FitHead } from './fit.js';
import type { IcpPlan, PlanQuery } from './planner.js';
import { domainHash } from './suppression.js';

/** Candidates one ask returns at most. */
export const INDEX_MAX = 300;
/** Words kept of one query, so a long query does not ask for every word on one page. */
const MAX_WORDS = 6;
/** Plan queries asked at once: core, adjacent, wider and the segments are about 60 at most. */
const MAX_QUERIES = 80;
/** Rows read per asked candidate, for the suppressed, the subdomains of one site and the wrong country. */
const OVERFETCH = 2;
/**
 * Plan words a page must hold to be a candidate (all of them when the plan
 * has fewer): one shared word ("agency") says nothing, two start to.
 */
export const MIN_MATCHED = 2;

export interface IndexCandidate {
  /** The domain as stored: the host the crawl read, or the launch's registrable domain. */
  domain: string;
  name: string;
  website: string;
  /** What the company says about itself, without addresses. */
  snippet: string;
  /** The homepage's title and description when its text is kept: fit scoring needs no fetch then. */
  head?: FitHead;
  /** How many of the plan's words its best page holds: candidates holding more come first. */
  matched: number;
  /** Text rank, highest first among candidates holding as many words. */
  rank: number;
  /** Where the words matched: a crawled page, a launch, or both. */
  from: 'pages' | 'feed' | 'both';
}

export interface IndexAsk {
  plan: Pick<IcpPlan, 'core' | 'adjacent' | 'wider' | 'countries' | 'segments'>;
  /** Registrable domains to leave out: the search's companies and the sites turned down. */
  exclude?: Iterable<string>;
  limit: number;
}

/** Anything shaped like an email address. */
const ADDRESS = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+/g;
/** Brave operators the index has no use for: `site:x`, `-word`, `OR`. */
const OPERATOR = /(^|\s)(site:\S+|-\S+)|\bOR\b/g;

/** The words of a query, lowercased, operators dropped: "B2B appointment-setting agency" gives b2b, appointment, setting, agency. */
export function queryWords(q: string): string[] {
  const words = q
    .replace(OPERATOR, ' ')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, MAX_WORDS);
}

/**
 * ccTLDs companies everywhere use as generic ones (.io, .ai, .co): they say
 * nothing about the country.
 */
const GENERIC_CC = new Set(['io', 'ai', 'co', 'me', 'tv', 'ly', 'gg', 'so', 'sh', 'to', 'fm', 'am', 'cc', 'ws', 'xyz', 'eu', 'app', 'dev', 'vc', 'gl', 'is', 'it', 'la', 'im', 'st', 'mu', 'nu', 'tech']);

/**
 * The country a domain's TLD stands for (ISO 3166-1 alpha-2), or null for a
 * generic one. ".uk" is "gb". ".it" and ".is" count as generic: they are
 * used as words ("get.it") about as often as for Italy and Iceland.
 */
export function tldCountry(domain: string): string | null {
  const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
  if (tld.length !== 2 || GENERIC_CC.has(tld)) return null;
  return tld === 'uk' ? 'gb' : tld;
}

/** Text from a page on one line, without addresses. */
function clean(text: string | null | undefined, max: number): string {
  return (text ?? '').replace(ADDRESS, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** The company's name from its homepage title: the part that names the domain ("Acme | Cold email" gives "Acme"), else the first. */
export function nameFromTitle(title: string, domain: string): string {
  const label = (registrableDomain(domain).split('.')[0] ?? '').replace(/[^a-z0-9]/g, '');
  const parts = title
    .split(/\s+[|\u2013\u2014:\u00b7\u2022-]\s+|\s*\|\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && p.length <= 60);
  const named = parts.find((p) => label.length >= 3 && p.toLowerCase().replace(/[^a-z0-9]/g, '').includes(label));
  return named ?? parts[0] ?? registrableDomain(domain);
}

/**
 * The words a plan asks the index for, each as tsquery text in both forms
 * the index holds, 'simple' and 'english', so "agencies" matches "agency"
 * and "Agentur" matches itself: the words of every query and segment, once
 * each. Empty when the plan has no words.
 */
export async function planWords(sql: Sql, plan: IndexAsk['plan']): Promise<string[]> {
  const phrases = [...plan.core, ...(plan.segments ?? []).map((q): PlanQuery => ({ q })), ...plan.adjacent, ...plan.wider]
    .map((q) => queryWords(q.q))
    .filter((w) => w.length > 0);
  const seen = new Set<string>();
  const unique = phrases.filter((w) => {
    const key = [...w].sort().join(' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_QUERIES);
  const words = [...new Set(unique.flat())];
  if (words.length === 0) return [];
  // Postgres makes the lexemes, quoted as tsquery text, so the query is built from its own output.
  const rows = await sql<{ w: string; s: string; e: string }[]>`
    select w, plainto_tsquery('simple', w)::text as s, plainto_tsquery('english', w)::text as e
    from unnest(${words}::text[]) as w
  `;
  const forms: string[] = [];
  for (const r of rows) {
    // An English stop word ("the", "for") matches every page: it is left out of the query.
    if (!r.s || !r.e) continue;
    forms.push(r.s === r.e ? r.s : `(${r.s} | ${r.e})`);
  }
  return [...new Set(forms)];
}

/**
 * The tsquery text for a plan: any of its words (planWords). A page need not
 * hold every word of a query; the search ranks pages by how many of the
 * plan's words they hold. Null when the plan has no words.
 */
export async function planQuery(sql: Sql, plan: IndexAsk['plan']): Promise<string | null> {
  const forms = await planWords(sql, plan);
  return forms.length ? forms.join(' | ') : null;
}

/** The registrable domains of `domains` that are suppressed. */
async function suppressedSites(sql: Sql, domains: string[]): Promise<Set<string>> {
  if (domains.length === 0) return new Set();
  const byHash = new Map(domains.map((d) => [domainHash(d), registrableDomain(d)]));
  const rows = await sql<{ hash: string }[]>`select hash from suppressions where kind = 'domain' and hash = any(${[...byHash.keys()]}::text[])`;
  return new Set(rows.map((r) => byHash.get(r.hash)!));
}

interface Row {
  domain: string;
  matched: number;
  rank: number;
  from_pages: boolean;
  from_feed: boolean;
  url: string | null;
  title: string | null;
  description: string | null;
  text: string | null;
  feed_name: string | null;
  feed_website: string | null;
  tagline: string | null;
  feed_description: string | null;
}

/**
 * Companies the index holds for a plan, those whose best page holds the most
 * of the plan's words first, then by text rank: crawled pages and launches
 * holding at least MIN_MATCHED of its words. Leaves out the
 * excluded sites, suppressed domains, domains whose last crawl failed, was
 * blocked or refused us, and domains whose TLD names a country the plan does
 * not search (a generic TLD passes). One company per registrable domain.
 */
export async function searchCompanyIndex(sql: Sql, ask: IndexAsk): Promise<IndexCandidate[]> {
  const limit = Math.min(ask.limit, INDEX_MAX);
  if (limit <= 0) return [];
  const forms = await planWords(sql, ask.plan);
  if (forms.length === 0) return [];
  const query = forms.join(' | ');
  const least = Math.min(MIN_MATCHED, forms.length);
  const exclude = new Set(ask.exclude ?? []);
  const countries = new Set([...ask.plan.countries, ...[...ask.plan.core, ...ask.plan.adjacent, ...ask.plan.wider].flatMap((q) => q.country ?? [])]);

  const rows = await sql<Row[]>`
    with q as (select ${query}::tsquery as q, array(select w::tsquery from unnest(${forms}::text[]) as w) as words),
    -- Any word matches (the GIN index finds those), then each row counts the words it holds.
    pages as (
      select p.domain, ts_rank_cd(p.search, q.q) as rank,
        (select count(*)::int from unnest(q.words) as w where p.search @@ w) as matched
      from domain_pages p cross join q
      join domains d on d.domain = p.domain
      where p.search @@ q.q and d.crawl_status not in ('failed', 'blocked', 'refused')
        and p.domain <> all(${[...exclude]}::text[])
    ),
    feed as (
      select f.domain, ts_rank_cd(f.search, q.q) as rank,
        (select count(*)::int from unnest(q.words) as w where f.search @@ w) as matched
      from feed_items f cross join q
      where f.search @@ q.q and f.domain <> all(${[...exclude]}::text[])
        and not exists (select 1 from domains d where d.domain = f.domain and d.crawl_status in ('failed', 'blocked', 'refused'))
    ),
    hits as (
      select domain, max(matched) as matched, max(rank) as rank, true as from_pages, false as from_feed
      from pages where matched >= ${least} group by domain
      union all
      select domain, max(matched), max(rank), false, true
      from feed where matched >= ${least} group by domain
    ),
    ranked as (
      select domain, max(matched) as matched, max(rank) as rank, bool_or(from_pages) as from_pages, bool_or(from_feed) as from_feed
      from hits group by domain
      order by max(matched) desc, max(rank) desc, domain
      limit ${limit * OVERFETCH}
    )
    select r.domain, r.matched, r.rank::float8 as rank, r.from_pages, r.from_feed,
           h.url, h.title, h.description, left(h.text, 600) as text,
           f.name as feed_name, f.website as feed_website, f.tagline, left(f.description, 600) as feed_description
    from ranked r
    left join lateral (
      -- The homepage: the address with no path, else the shortest kept.
      select url, title, description, text from domain_pages p
      where p.domain = r.domain
      order by (url ~ '^https?://[^/]+/?$') desc, length(url), url
      limit 1
    ) h on true
    left join lateral (
      select name, website, tagline, description from feed_items f
      where f.domain = r.domain order by discovered_at desc limit 1
    ) f on true
    order by r.matched desc, r.rank desc, r.domain
  `;

  const suppressed = await suppressedSites(sql, rows.map((r) => r.domain));
  const out: IndexCandidate[] = [];
  const sites = new Set<string>();
  for (const r of rows) {
    const site = registrableDomain(r.domain);
    if (exclude.has(site) || suppressed.has(site) || sites.has(site)) continue;
    const country = tldCountry(r.domain);
    if (country && countries.size > 0 && !countries.has(country)) continue;
    sites.add(site);
    const head = r.url ? { title: clean(r.title, 200), description: clean(r.description, 400) } : undefined;
    const name = r.feed_name?.trim() || nameFromTitle(clean(r.title, 200), r.domain);
    const snippet = clean(r.tagline || r.feed_description || r.text || r.description, 300);
    out.push({
      domain: r.domain,
      name,
      website: r.url ? `https://${r.domain}` : (r.feed_website ?? `https://${r.domain}`),
      snippet,
      head,
      matched: r.matched,
      rank: r.rank,
      from: r.from_pages && r.from_feed ? 'both' : r.from_pages ? 'pages' : 'feed',
    });
    if (out.length >= limit) break;
  }
  return out;
}
