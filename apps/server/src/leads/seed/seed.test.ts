import { readFileSync } from 'node:fs';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db.js';
import type { CrawlResult } from '../crawl.js';
import { RateLimiter } from '../limits.js';
import { RobotsCache } from '../robots.js';
import { domainHash } from '../suppression.js';
import { seedSkipReason } from './filter.js';
import { importSeed, seedQueue } from './import.js';
import { seedEntries, seedParser } from './sources.js';
import { seedBatchSize, seedTick, type SeedDeps } from './tick.js';

const FIXTURE = readFileSync(new URL('./fixtures/majestic-sample.csv', import.meta.url), 'utf8').split('\n');
const NOW = new Date('2026-10-22T12:00:00Z');

async function collect(lines: string[]) {
  const out = [];
  for await (const e of seedEntries(lines)) out.push(e);
  return out;
}

describe('seedParser', () => {
  it('reads the Majestic CSV by its header, registrable domains with their global rank', async () => {
    const entries = await collect(FIXTURE);
    expect(entries).toHaveLength(13);
    expect(entries[0]).toEqual({ domain: 'google.com', rank: 1 });
    expect(entries.find((e) => e.rank === 9)).toEqual({ domain: 'brightfield.io', rank: 9 });
  });

  it('reads Common Crawl ranks, reversed hosts with the harmonic centrality position', async () => {
    const entries = await collect([
      '#harmonicc_pos\t#harmonicc_val\t#pr_pos\t#pr_val\t#host_rev\t#n_hosts',
      '1\t3.1E7\t2\t0.01\tcom.example\t12',
      '2\t3.0E7\t1\t0.02\tdk.nordlys.shop\t1',
    ]);
    expect(entries).toEqual([
      { domain: 'example.com', rank: 1 },
      { domain: 'nordlys.dk', rank: 2 },
    ]);
  });

  it('reads "rank,domain" without a header and one domain per line', async () => {
    expect(await collect(['1,acme.com', '2,https://www.beta.io/about'])).toEqual([
      { domain: 'acme.com', rank: 1 },
      { domain: 'beta.io', rank: 2 },
    ]);
    const parse = seedParser();
    // A blank line is not a row; a line without a domain is.
    expect(['acme.com', '', 'not a domain', 'info@gamma.de'].map(parse)).toEqual([{ domain: 'acme.com', rank: 1 }, null, null, { domain: 'gamma.de', rank: 3 }]);
  });
});

describe('seedSkipReason', () => {
  it('turns down platforms, infrastructure, directories and public bodies, keeps companies', () => {
    expect(seedSkipReason('google.com')).toBe('platform');
    expect(seedSkipReason('gmail.com')).toBe('webmail');
    expect(seedSkipReason('clutch.co')).toBe('platform');
    expect(seedSkipReason('designrush.com')).toBe('directory');
    expect(seedSkipReason('googletagmanager.com')).toBe('infrastructure');
    expect(seedSkipReason('d1.cloudfront.net')).toBe('infrastructure');
    expect(seedSkipReason('nhs.gov.uk')).toBe('public_or_adult');
    expect(seedSkipReason('gov.uk')).toBe('public_or_adult');
    expect(seedSkipReason('ox.ac.uk')).toBe('public_or_adult');
    expect(seedSkipReason('whitehouse.gov')).toBe('public_or_adult');
    expect(seedSkipReason('acme-agency.com')).toBeNull();
    expect(seedSkipReason('acme.co.uk')).toBeNull();
    expect(seedSkipReason('brightfield.io')).toBeNull();
  });
});

describe('seedBatchSize', () => {
  it('spreads the day over the minutes, within what the last 24 hours left', () => {
    expect(seedBatchSize(0, 0)).toBe(0);
    expect(seedBatchSize(1_440, 0)).toBe(1);
    expect(seedBatchSize(2_000, 0)).toBe(2);
    expect(seedBatchSize(2_000, 1_999)).toBe(1);
    expect(seedBatchSize(2_000, 2_000)).toBe(0);
    expect(seedBatchSize(100_000, 0)).toBe(12);
  });
});

describe('importSeed and seedTick', () => {
  let db: TestDb;
  const crawled: string[] = [];
  const fakeCrawl = async (website: string, domain: string): Promise<CrawlResult> => {
    crawled.push(domain);
    return {
      status: 'done',
      emails: [
        { address: `info@${domain}`, kind: 'generic', sourceUrl: website },
        { address: `ole@${domain}`, kind: 'personal', sourceUrl: website },
      ] as CrawlResult['emails'],
      pages: [],
      texts: [{ url: website, title: `${domain} | Outbound agency`, description: 'We book meetings', text: 'Outbound agency for SaaS' }],
      people: [],
      peopleTexts: [],
    };
  };
  const limiter = new RateLimiter(0);
  const deps = (over: Partial<SeedDeps> = {}): SeedDeps => ({
    sql: db.sql,
    crawl: { limiter, robots: new RobotsCache({ limiter }) },
    log: pino({ level: 'silent' }),
    dailyDomains: 1_440 * 3,
    crawlSite: fakeCrawl,
    now: () => NOW,
    ...over,
  });

  beforeAll(async () => {
    db = await createTestDb();
    await db.sql`insert into suppressions (hash, kind) values (${domainHash('suppressed-co.com')}, 'domain')`;
    await db.sql`
      insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at)
      values ('already-crawled.com', 'done', ${NOW}, false, ${new Date(NOW.getTime() + 86_400_000)})
    `;
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(() => {
    crawled.length = 0;
  });

  it('imports the companies of a list, past the skipped head, once', async () => {
    const r = await importSeed(db.sql, seedEntries(FIXTURE), { source: 'majestic', limit: 100, skipTop: 1 });
    expect(r).toEqual({ read: 13, filtered: 6, known: 2, added: 4 });
    const rows = await db.sql<{ domain: string }[]>`select domain from seed_domains order by rank`;
    expect(rows.map((x) => x.domain)).toEqual(['acme-agency.com', 'nordlys.dk', 'brightfield.io', 'quietworks.com']);

    const again = await importSeed(db.sql, seedEntries(FIXTURE), { source: 'majestic', limit: 100, skipTop: 1 });
    expect(again.added).toBe(0);
    const capped = await importSeed(db.sql, [{ domain: 'one.com', rank: 50 }, { domain: 'two.com', rank: 51 }], { source: 'file', limit: 1 });
    expect(capped.added).toBe(1);
    await db.sql`delete from seed_domains where source = 'file'`;
  });

  it('waits while users have crawls queued, and when off', async () => {
    const [job] = await db.sql<{ id: string }[]>`insert into jobs (type, payload, run_after) values ('crawl', '{}', ${NOW}) returning id`;
    try {
      expect(await seedTick(deps())).toEqual({ crawled: 0, skipped: 0, waited: 'busy' });
    } finally {
      await db.sql`delete from jobs where id = ${job!.id}`;
    }
    expect(await seedTick(deps({ dailyDomains: 0 }))).toEqual({ crawled: 0, skipped: 0, waited: 'off' });
    expect(crawled).toEqual([]);
  });

  it('crawls the best ranked into the crawl cache, due for a recrawl at once, within the daily cap', async () => {
    expect(await seedTick(deps())).toEqual({ crawled: 3, skipped: 0 });
    expect(crawled.sort()).toEqual(['acme-agency.com', 'brightfield.io', 'nordlys.dk']);

    const [d] = await db.sql<{ crawl_status: string; due: boolean; has_personal: boolean }[]>`
      select crawl_status, recheck_at <= crawled_at as due, has_personal from domains where domain = 'acme-agency.com'
    `;
    expect(d).toEqual({ crawl_status: 'done', due: true, has_personal: true });
    const pages = await db.sql`select url, title from domain_pages where domain = 'acme-agency.com'`;
    expect(pages).toHaveLength(1);
    const emails = await db.sql`select address from domain_emails where domain = 'acme-agency.com'`;
    expect(emails.map((e) => e.address)).toEqual(['info@acme-agency.com']);

    // Three crawled in the last 24 hours: a cap of three waits.
    expect(await seedTick(deps({ dailyDomains: 3 }))).toEqual({ crawled: 0, skipped: 0, waited: 'daily_cap' });
    expect(await seedQueue(db.sql, NOW)).toEqual({ queued: 1, running: 0, done: 3, skipped: 0, lastDay: 3 });
  });

  it('skips a domain a search crawled after the import', async () => {
    await db.sql`
      insert into domains (domain, crawl_status, crawled_at, has_personal, recheck_at)
      values ('quietworks.com', 'done', ${NOW}, false, ${NOW})
    `;
    expect(await seedTick(deps())).toEqual({ crawled: 0, skipped: 1 });
    expect(crawled).toEqual([]);
    const [row] = await db.sql`select status, outcome from seed_domains where domain = 'quietworks.com'`;
    expect(row).toEqual({ status: 'skipped', outcome: 'known' });
  });
});
