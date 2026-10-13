// Access requests (GDPR Article 15): everything nvoke holds about one address.
// The operator runs this from the CLI after checking the requester's identity.

import type { Sql } from 'postgres';
import { addressHash, domainHash } from '../leads/suppression.js';
import { domainOf } from '../leads/extract.js';
import { parseAddress } from './target.js';

export interface SubjectExport {
  address: string;
  generatedAt: string;
  /** Suppression entries that cover the address (by address or by its domain). */
  suppressions: Array<{ kind: 'address' | 'domain'; source: string; createdAt: string }>;
  /** The shared cache: where the address was published. Generic role addresses only. */
  cache: Array<{ domain: string; sourceUrl: string | null; firstSeen: string; lastSeen: string }>;
  /** Copies in customers' searches, one entry per search. */
  searches: Array<{
    searchId: string;
    createdAt: string;
    clerkUserId: string;
    searchKind: string;
    entries: Array<{
      company: string;
      companyDomain: string;
      kind: 'generic' | 'personal';
      sourceUrl: string | null;
      verification: string | null;
      checkedAt: string | null;
      foundAt: string;
    }>;
  }>;
  /** The verification cache (kept 30 days). */
  verification: { verification: string; mxHost: string | null; reason: string | null; checkedAt: string } | null;
  /** Customers billed for this address as a verified email. */
  billing: Array<{ clerkUserId: string; period: string; billedAt: string }>;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export async function exportSubject(sql: Sql, input: string): Promise<SubjectExport> {
  const address = parseAddress(input);
  if (!address) throw new Error(`not an email address: ${input}`);
  const hashes = [addressHash(address), domainHash(domainOf(address))];

  const [suppressions, cache, emails, checks, billing] = await Promise.all([
    sql<{ kind: 'address' | 'domain'; source: string; created_at: Date }[]>`
      select kind, source, created_at from suppressions where hash in ${sql(hashes)} order by created_at`,
    sql<{ domain: string; source_url: string | null; first_seen: Date; last_seen: Date }[]>`
      select domain, source_url, first_seen, last_seen from domain_emails where address = ${address} order by first_seen`,
    sql<
      {
        search_id: string;
        search_created_at: Date;
        clerk_user_id: string;
        search_kind: string;
        company: string;
        company_domain: string;
        kind: 'generic' | 'personal';
        source_url: string | null;
        verification: string | null;
        checked_at: Date | null;
        created_at: Date;
      }[]
    >`
      select e.search_id, s.created_at as search_created_at, s.clerk_user_id, s.kind as search_kind,
             c.name as company, c.domain as company_domain,
             e.kind, e.source_url, e.verification, e.checked_at, e.created_at
      from emails e
      join searches s on s.id = e.search_id
      join companies c on c.id = e.company_id
      where e.address = ${address}
      order by s.created_at, e.created_at`,
    sql<{ verification: string; mx_host: string | null; reason: string | null; checked_at: Date }[]>`
      select verification, mx_host, reason, checked_at from email_checks where address = ${address}`,
    sql<{ clerk_user_id: string; period: string; billed_at: Date }[]>`
      select clerk_user_id, period, billed_at from billed_emails where address = ${address} order by billed_at`,
  ]);

  const searches = new Map<string, SubjectExport['searches'][number]>();
  for (const e of emails) {
    let s = searches.get(e.search_id);
    if (!s) {
      s = {
        searchId: e.search_id,
        createdAt: e.search_created_at.toISOString(),
        clerkUserId: e.clerk_user_id,
        searchKind: e.search_kind,
        entries: [],
      };
      searches.set(e.search_id, s);
    }
    s.entries.push({
      company: e.company,
      companyDomain: e.company_domain,
      kind: e.kind,
      sourceUrl: e.source_url,
      verification: e.verification,
      checkedAt: iso(e.checked_at),
      foundAt: e.created_at.toISOString(),
    });
  }

  const check = checks[0];
  return {
    address,
    generatedAt: new Date().toISOString(),
    suppressions: suppressions.map((r) => ({ kind: r.kind, source: r.source, createdAt: r.created_at.toISOString() })),
    cache: cache.map((r) => ({
      domain: r.domain,
      sourceUrl: r.source_url,
      firstSeen: r.first_seen.toISOString(),
      lastSeen: r.last_seen.toISOString(),
    })),
    searches: [...searches.values()],
    verification: check
      ? { verification: check.verification, mxHost: check.mx_host, reason: check.reason, checkedAt: check.checked_at.toISOString() }
      : null,
    billing: billing.map((r) => ({ clerkUserId: r.clerk_user_id, period: r.period, billedAt: r.billed_at.toISOString() })),
  };
}
