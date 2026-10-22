// Imports a batch of a free domain list into seed_domains
// (migration 1830_company_seed), for the seed tick to crawl. Leaves out what
// the filter turns down, suppressed domains, domains a crawl already holds
// (domains: a search or an earlier seed read them) and domains already
// queued. Writes domain names only.

import type { Sql } from 'postgres';
import { domainHash } from '../suppression.js';
import { seedSkipReason } from './filter.js';
import type { SeedEntry } from './sources.js';

/** Rows checked and inserted at once. */
const BATCH = 1_000;

export interface SeedImport {
  /** Entries read from the list, the skipped head included. */
  read: number;
  /** Turned down by the filter (platforms, CDNs, public bodies). */
  filtered: number;
  /** Suppressed, already crawled or already queued. */
  known: number;
  added: number;
}

export interface SeedImportOptions {
  source: string;
  /** Domains to add at most. */
  limit: number;
  /** Entries ranked this high or higher are passed over: the list's head. */
  skipTop?: number;
}

export async function importSeed(sql: Sql, entries: AsyncIterable<SeedEntry> | Iterable<SeedEntry>, opts: SeedImportOptions): Promise<SeedImport> {
  const out: SeedImport = { read: 0, filtered: 0, known: 0, added: 0 };
  const seen = new Set<string>();
  let batch: SeedEntry[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const domains = batch.map((e) => e.domain);
    const hashes = new Map(domains.map((d) => [domainHash(d), d]));
    const [crawled, suppressed] = await Promise.all([
      sql<{ domain: string }[]>`select domain from domains where domain = any(${domains}::text[])`,
      sql<{ hash: string }[]>`select hash from suppressions where kind = 'domain' and hash = any(${[...hashes.keys()]}::text[])`,
    ]);
    const skip = new Set([...crawled.map((r) => r.domain), ...suppressed.map((r) => hashes.get(r.hash)!)]);
    const fresh = batch.filter((e) => !skip.has(e.domain));
    const rows = fresh.slice(0, opts.limit - out.added).map((e) => ({ domain: e.domain, source: opts.source, rank: e.rank }));
    const inserted = rows.length
      ? await sql<{ domain: string }[]>`
          insert into seed_domains ${sql(rows, 'domain', 'source', 'rank')}
          on conflict (domain) do nothing
          returning domain
        `
      : [];
    out.added += inserted.length;
    out.known += batch.length - fresh.length + rows.length - inserted.length;
    batch = [];
  };

  for await (const entry of entries) {
    out.read++;
    if (entry.rank <= (opts.skipTop ?? 0)) continue;
    // A list of hosts names one company many times (www, shop, blog).
    if (seen.has(entry.domain)) continue;
    seen.add(entry.domain);
    if (seedSkipReason(entry.domain)) {
      out.filtered++;
      continue;
    }
    batch.push(entry);
    if (batch.length >= Math.min(BATCH, opts.limit - out.added)) await flush();
    if (out.added >= opts.limit) break;
  }
  await flush();
  return out;
}

export interface SeedQueue {
  queued: number;
  running: number;
  done: number;
  skipped: number;
  /** Crawled in the last 24 hours, against SEED_DAILY_DOMAINS. */
  lastDay: number;
}

export async function seedQueue(sql: Sql, now: Date = new Date()): Promise<SeedQueue> {
  const [r] = await sql<SeedQueue[]>`
    select count(*) filter (where status = 'queued')::int as queued,
           count(*) filter (where status = 'running')::int as running,
           count(*) filter (where status = 'done')::int as done,
           count(*) filter (where status = 'skipped')::int as skipped,
           count(*) filter (where crawled_at > ${now}::timestamptz - interval '24 hours')::int as "lastDay"
    from seed_domains
  `;
  return r!;
}
