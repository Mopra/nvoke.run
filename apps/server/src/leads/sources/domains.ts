// Companies from a list the user already has: domains, URLs, email
// addresses or company names (docs/SPEC.md, "Search kinds").
//
// Domains cost nothing and go straight to the crawl. A name is first tried
// on the free routes of resolve-name.ts (names past searches found, a guessed
// domain whose homepage carries the name, Wikidata). Only when they find
// nothing is it looked up with one Brave request (the first result page,
// shared with web searches through the cache), and the result whose domain
// looks most like the name wins. Platforms and webmail are never a company's
// website.

import { itemDomain, type DomainsSearchParams } from '@nvoke/shared';
import { isOwnSiteDomain, isWebmailDomain, nameMatch, normalizeDomain, registrableDomain } from '../domain.js';
import { emptyRouteCounts, type NameResolver } from './resolve-name.js';
import { braveQuery, type BraveClient } from './web.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';

export { nameMatch, nameTokens } from '../domain.js';

/** The top results a name lookup falls back to when none looks like the name. */
const FALLBACK_RESULTS = 3;

/** The website for a name among search results, or null when none will do. */
export function pickWebsite(name: string, results: FoundCompany[]): FoundCompany | null {
  const usable = results.filter((r) => {
    const domain = normalizeDomain(r.website);
    return domain !== null && isOwnSiteDomain(domain);
  });
  let best: FoundCompany | null = null;
  let bestScore = 0;
  for (const r of usable) {
    const score = nameMatch(name, normalizeDomain(r.website)!);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best ?? usable.find((r) => results.indexOf(r) < FALLBACK_RESULTS) ?? null;
}

/** The label a domain is known by: "shop.acme.co.uk" gives "acme". */
function brandLabel(domain: string): string {
  return registrableDomain(domain).split('.')[0] ?? domain;
}

/** "acme-dental.dk" becomes "Acme Dental". */
export function nameFromDomain(domain: string): string {
  const label = brandLabel(domain);
  return label
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export interface DomainsAdapterOptions {
  /** Free routes tried for a name before Brave. */
  resolveName?: NameResolver;
}

export function domainsAdapter(brave: BraveClient, opts: DomainsAdapterOptions = {}): SourceAdapter<DomainsSearchParams> {
  return {
    kind: 'domains',
    async *find(params, ctx) {
      const names: string[] = [];
      let yielded = 0;
      // Domains first: free, and the crawl starts while names are looked up.
      for (const item of params.items) {
        const domain = itemDomain(item);
        if (!domain) {
          names.push(item);
          continue;
        }
        // An address on gmail.com says nothing about a company.
        if (isWebmailDomain(domain)) continue;
        yielded++;
        yield { name: nameFromDomain(domain), website: `https://${domain}/`, source: 'list', sourceRef: item };
      }
      if (names.length === 0) return;
      const resolver = opts.resolveName;
      if (!brave.configured && !resolver) {
        ctx.log.warn({ names: names.length }, 'domains: names skipped, web search is not configured');
        if (yielded === 0) throw notConfigured();
        return;
      }
      const routes = emptyRouteCounts();
      try {
        for (const name of names) {
          const free = await resolver?.resolve({ name, country: params.country }, ctx);
          if (free) {
            routes[free.route]++;
            yielded++;
            yield { name, website: free.website, source: free.route };
            continue;
          }
          if (!brave.configured) {
            routes.none++;
            continue;
          }
          const { q, country } = braveQuery({ keyword: name, country: params.country });
          const page = await brave.page({ q, country, page: 0 }, ctx);
          const hit = pickWebsite(name, page.companies);
          if (!hit) {
            routes.none++;
            ctx.log.debug({ name }, 'domains: no website found');
            continue;
          }
          routes.brave++;
          yielded++;
          yield { name, website: hit.website, source: 'brave', sourceRef: hit.sourceRef };
        }
      } finally {
        ctx.log.info({ names: names.length, routes }, 'domains: names looked up');
      }
      if (!brave.configured && yielded === 0) throw notConfigured();
    },
  };
}

function notConfigured(): PermanentError {
  return new PermanentError('looking up company names needs web search, which is not configured on this server', 'source_not_configured');
}
