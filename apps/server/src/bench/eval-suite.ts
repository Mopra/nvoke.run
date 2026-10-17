// The lead-quality eval's fixed suite (eval-run.ts). Each entry is one kind
// of buyer: `intent` says in plain words who the user wants to sell to (the
// judges read it, and so will a future plain-words search kind), and
// `searches` are the concrete searches in today's kinds a user would run for
// it today, the baseline. An entry's metrics add up its searches.
//
// Change an entry only on purpose: runs are compared across time by id.

import { CreateSearchRequest, type CreateSearchInput } from '@nvoke/shared';

export interface EvalEntry {
  id: string;
  intent: string;
  searches: CreateSearchInput[];
  /** Where to look in `--mode icp`, which runs one plain-words search per entry instead of `searches`. */
  icp?: { countries?: string[]; locations?: string[]; limit?: number };
}

/** Companies one plain-words search may hold in `--mode icp` unless the entry says otherwise. */
export const ICP_LIMIT = 1000;

/** The entry as one plain-words (`icp`) search for its intent: what a user would type today. */
export function asIcp(entry: EvalEntry): EvalEntry {
  const { countries, locations, limit } = entry.icp ?? {};
  return {
    ...entry,
    searches: [{ kind: 'icp', params: { description: entry.intent, countries, locations }, limit: limit ?? ICP_LIMIT }],
  };
}

export const EVAL_SUITE: EvalEntry[] = [
  {
    id: 'nvoke-customers',
    intent:
      'Founders of B2B companies, outbound and lead generation agencies, freelancers, SDRs and small sales teams that do cold outbound in the EU and the US. We sell them a cheap lead finder with verified emails.',
    searches: [
      { kind: 'web', params: { keyword: 'outbound lead generation agency', country: 'gb' }, limit: 100 },
      { kind: 'web', params: { keyword: 'B2B growth marketing agency', country: 'us' }, limit: 100 },
      { kind: 'web', params: { keyword: 'cold email agency', country: 'de' }, limit: 100 },
      { kind: 'web', params: { keyword: 'B2B SaaS startup', country: 'dk' }, limit: 100 },
    ],
  },
  {
    id: 'dentists-aarhus',
    intent: 'Dental clinics in Aarhus, Denmark: the owner or practice manager. We sell them a service for dental practices.',
    searches: [{ kind: 'local', params: { niche: 'dentists', location: 'Aarhus' }, limit: 100 }],
    icp: { locations: ['Aarhus'], countries: ['dk'], limit: 300 },
  },
  {
    id: 'accountants-copenhagen',
    intent: 'Accounting and bookkeeping firms in Copenhagen: partners and owners. We sell them software and services for accountants.',
    searches: [{ kind: 'local', params: { niche: 'accountant', location: 'Copenhagen' }, limit: 100 }],
    icp: { locations: ['Copenhagen'], countries: ['dk'], limit: 300 },
  },
  {
    id: 'software-agencies-de',
    intent: 'Software development agencies and consultancies in Germany: founders, managing directors and CTOs. We sell them a B2B service.',
    searches: [{ kind: 'web', params: { keyword: 'software development agency', country: 'de' }, limit: 100 }],
    icp: { countries: ['de'], limit: 500 },
  },
  {
    id: 'shopify-agencies-us',
    intent: 'Shopify and ecommerce agencies in the US: founders and partners. We sell them an app or service they resell to their clients.',
    searches: [{ kind: 'web', params: { keyword: 'Shopify agency', country: 'us' }, limit: 100 }],
    icp: { countries: ['us'], limit: 500 },
  },
  {
    id: 'recruiters-london',
    intent: 'Recruitment and staffing agencies in London: founders, directors and team leads. We sell them a sourcing tool.',
    searches: [{ kind: 'web', params: { keyword: 'recruitment agency London', country: 'gb' }, limit: 100 }],
    icp: { locations: ['London'], countries: ['gb'], limit: 300 },
  },
  {
    id: 'law-firms-munich',
    intent: 'Law firms and solo lawyers in Munich: partners and owners. We sell them legal software and services.',
    searches: [{ kind: 'local', params: { niche: 'lawyer', location: 'München' }, limit: 100 }],
    icp: { locations: ['München'], countries: ['de'], limit: 300 },
  },
  {
    id: 'launches',
    intent: 'Founders of SaaS and software products that just launched (Product Hunt, Show HN). We sell them a tool for early go to market.',
    searches: [{ kind: 'launches', params: {}, limit: 100 }],
    icp: { limit: 300 },
  },
  {
    id: 'hard-pump-makers',
    intent: 'Family-owned manufacturers of industrial pumps in Germany: owners and managing directors. We sell them industrial supplies.',
    searches: [{ kind: 'web', params: { keyword: 'family-owned industrial pump manufacturer', country: 'de' }, limit: 100 }],
    icp: { countries: ['de'], limit: 300 },
  },
];

/** An entry's searches, validated as the API would. Throws on a search that does not parse. */
export function entryRequests(entry: EvalEntry): CreateSearchRequest[] {
  return entry.searches.map((s, i) => {
    const parsed = CreateSearchRequest.safeParse(s);
    if (!parsed.success) {
      throw new Error(`${entry.id} search ${i}: ${parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join(', ')}`);
    }
    return parsed.data;
  });
}

/** The suite, or the entries named in `only`. Throws on an unknown id. */
export function pickEntries(only: string[] | undefined, suite: EvalEntry[] = EVAL_SUITE): EvalEntry[] {
  if (!only || only.length === 0) return suite;
  const unknown = only.filter((id) => !suite.some((e) => e.id === id));
  if (unknown.length > 0) throw new Error(`unknown eval entries: ${unknown.join(', ')} (known: ${suite.map((e) => e.id).join(', ')})`);
  return suite.filter((e) => only.includes(e.id));
}
