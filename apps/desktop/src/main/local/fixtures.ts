import type { Company, Search } from '@nvoke/shared';

/** Test data for the local store and sync tests. */

export const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

export function search(n: number, extra: Partial<Search> = {}): Search {
  return {
    id: uuid(n),
    kind: 'local',
    params: { niche: 'dentists', location: 'Aarhus' },
    limit: 100,
    status: 'done',
    error: null,
    companiesFound: 2,
    companiesCrawled: 2,
    emailsFound: 3,
    emailsValid: 2,
    createdAt: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(),
    startedAt: null,
    finishedAt: null,
    ...extra,
  } as Search;
}

export function company(n: number, name: string, emails: [string, 'generic' | 'personal', Company['emails'][number]['verification']][]): Company {
  return {
    id: uuid(1_000_000 + n),
    name,
    domain: `${name.toLowerCase().replace(/\W+/g, '')}.dk`,
    website: `https://${name.toLowerCase().replace(/\W+/g, '')}.dk`,
    source: 'osm',
    sourceRef: null,
    location: 'Aarhus',
    phone: null,
    category: null,
    crawlStatus: 'done',
    crawledAt: null,
    localCrawl: null,
    emails: emails.map(([address, kind, verification], i) => ({
      id: uuid(2_000_000 + n * 10 + i),
      address,
      kind,
      sourceUrl: null,
      verification,
      checkedAt: null,
    })),
  };
}
