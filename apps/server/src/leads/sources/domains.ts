// Companies from a list the user already has: domains, URLs, email
// addresses or company names (docs/SPEC.md, "Search kinds").
//
// Domains cost nothing and go straight to the crawl. A name is looked up
// with one Brave request (the first result page, shared with web searches
// through the cache), and the result whose domain looks most like the name
// wins. Platforms and webmail are never a company's website.

import { itemDomain, type DomainsSearchParams } from '@nvoke/shared';
import { isPlatformDomain, isWebmailDomain, normalizeDomain, registrableDomain } from '../domain.js';
import { braveQuery, type BraveClient } from './web.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';

/** The top results a name lookup falls back to when none looks like the name. */
const FALLBACK_RESULTS = 3;

/** Words that say what a company is, not which one. */
const LEGAL_WORDS = new Set([
  'a', 'ab', 'ag', 'and', 'aps', 'as', 'asa', 'bv', 'co', 'company', 'corp', 'corporation', 'gmbh', 'group', 'holding',
  'inc', 'incorporated', 'is', 'ivs', 'kg', 'limited', 'llc', 'llp', 'ltd', 'nv', 'oy', 'oyj', 'plc', 'pty', 's', 'sa',
  'sarl', 'sas', 'se', 'sl', 'spa', 'srl', 'the', 'og',
]);

/** "Mærsk A/S" becomes ["maersk"]. Danish and German letters spelled the way domains spell them. */
export function nameTokens(name: string): string[] {
  const folded = name
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  return folded.split(/[^a-z0-9]+/).filter((t) => t.length > 0 && !LEGAL_WORDS.has(t));
}

/** The label a domain is known by: "shop.acme.co.uk" gives "acme". */
function brandLabel(domain: string): string {
  return registrableDomain(domain).split('.')[0] ?? domain;
}

/**
 * How much a domain looks like a company name: 3 when the brand label is the
 * whole name run together (with "oe" also read as "o", so "Søstrene Grene"
 * matches sostrenegrene.com), 2 when it holds all of it or the name holds the
 * label, 1 when it holds the first word, 0 otherwise.
 */
export function nameMatch(name: string, domain: string): number {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return 0;
  const label = brandLabel(domain).replace(/-/g, '');
  const joined = tokens.join('');
  const variants = [joined, joined.replace(/oe/g, 'o').replace(/aa/g, 'a').replace(/ae/g, 'a')];
  if (variants.includes(label)) return 3;
  if (variants.some((v) => label.includes(v) || (label.length >= 4 && v.includes(label)))) return 2;
  const first = tokens[0]!;
  if (first.length >= 3 && label.includes(first)) return 1;
  return 0;
}

/** The website for a name among search results, or null when none will do. */
export function pickWebsite(name: string, results: FoundCompany[]): FoundCompany | null {
  const usable = results.filter((r) => {
    const domain = normalizeDomain(r.website);
    return domain !== null && !isPlatformDomain(domain) && !isWebmailDomain(domain);
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

/** "acme-dental.dk" becomes "Acme Dental". */
export function nameFromDomain(domain: string): string {
  const label = brandLabel(domain);
  return label
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function domainsAdapter(brave: BraveClient): SourceAdapter<DomainsSearchParams> {
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
      if (!brave.configured) {
        ctx.log.warn({ names: names.length }, 'domains: names skipped, web search is not configured');
        if (yielded === 0) {
          throw new PermanentError('looking up company names needs web search, which is not configured on this server', 'source_not_configured');
        }
        return;
      }
      for (const name of names) {
        const { q, country } = braveQuery({ keyword: name, country: params.country });
        const page = await brave.page({ q, country, page: 0 }, ctx);
        const hit = pickWebsite(name, page.companies);
        if (!hit) {
          ctx.log.debug({ name }, 'domains: no website found');
          continue;
        }
        yield { name, website: hit.website, source: 'brave', sourceRef: hit.sourceRef };
      }
    },
  };
}
