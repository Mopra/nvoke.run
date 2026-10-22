import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db.js';
import type { CrawlResult } from '../crawl.js';
import { RateLimiter } from '../limits.js';
import { RobotsCache } from '../robots.js';
import { demandFromPlans, demandKey, demandWords, rescoreSeed, seedDemand, stem } from './demand.js';
import { seedTick } from './tick.js';

const NOW = new Date('2026-10-22T12:00:00Z');

const churches = {
  countries: ['us'],
  segments: ['Spanish-English bilingual churches'],
  core: [{ q: 'multilingual church services', country: 'us' }],
  adjacent: [{ q: 'immigrant congregations' }],
};
const agencies = {
  countries: ['gb', 'nl', 'io'],
  segments: ['lead generation agencies'],
  core: [{ q: 'outbound agency for SaaS companies' }],
  adjacent: [],
};

describe('demand words', () => {
  it('stems plurals the way domain names spell them', () => {
    expect(['agencies', 'churches', 'startups', 'business', 'sales'].map(stem)).toEqual(['agency', 'church', 'startup', 'business', 'sale']);
  });

  it('keeps the words that say what a company is', () => {
    expect(demandWords('Small B2B SaaS startups and their 2 founders')).toEqual(['saas', 'startup']);
  });

  it('weighs each plan the same, and its countries by the TLD their companies use', () => {
    const d = demandFromPlans([churches, agencies]);
    expect(d.plans).toBe(2);
    expect(d.words.get('church')).toBe(0.5);
    expect(d.words.get('agency')).toBe(0.5);
    // .us for the US, .uk for gb, nothing for .io: it is used as a generic TLD.
    expect([...d.tlds.keys()].sort()).toEqual(['nl', 'uk', 'us']);
    expect(demandKey(d)).toBe(demandKey(demandFromPlans([agencies, churches])));
  });
});

describe('rescoreSeed and the claim order', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.sql`
      insert into seed_domains (domain, source, rank) values
        ('bigmedia.com', 'majestic', 10), ('gracechurch.org', 'majestic', 900), ('nordlys.nl', 'majestic', 500),
        ('outboundagency.co.uk', 'majestic', 700), ('quietworks.com', 'majestic', 20)
    `;
    await db.sql`insert into accounts (clerk_user_id) values ('u')`;
    for (const plan of [churches, agencies]) {
      await db.sql`insert into searches (clerk_user_id, kind, "limit", plan, created_at) values ('u', 'icp', 10, ${db.sql.json(plan)}, ${NOW})`;
    }
    // Too old to count.
    await db.sql`
      insert into searches (clerk_user_id, kind, "limit", plan, created_at)
      values ('u', 'icp', 10, ${db.sql.json({ ...agencies, segments: ['quiet works'], core: [], countries: [] })}, ${new Date(NOW.getTime() - 40 * 86_400_000)})
    `;
  });
  afterAll(async () => {
    await db.drop();
  });

  it('scores names and TLDs by recent plans, then crawls the best scored first', async () => {
    const demand = await seedDemand(db.sql, NOW);
    expect(demand.plans).toBe(2);
    expect(await rescoreSeed(db.sql, demand)).toBe(3);
    expect(await rescoreSeed(db.sql, demand)).toBe(0);

    const rows = await db.sql<{ domain: string; score: number }[]>`select domain, score from seed_domains order by score desc, rank`;
    expect(rows.map((r) => [r.domain, r.score])).toEqual([
      // agency and outbound, each 0.5, times two, and .uk.
      ['outboundagency.co.uk', 2.5],
      ['gracechurch.org', 1],
      ['nordlys.nl', 0.5],
      ['bigmedia.com', 0],
      ['quietworks.com', 0],
    ]);

    const crawled: string[] = [];
    const limiter = new RateLimiter(0);
    await seedTick({
      sql: db.sql,
      crawl: { limiter, robots: new RobotsCache({ limiter }) },
      log: pino({ level: 'silent' }),
      dailyDomains: 1_440,
      now: () => NOW,
      crawlSite: async (_website, domain) => {
        crawled.push(domain);
        return { status: 'done', emails: [], pages: [], texts: [], people: [], peopleTexts: [] } as unknown as CrawlResult;
      },
    });
    expect(crawled).toEqual(['outboundagency.co.uk']);
  });
});
