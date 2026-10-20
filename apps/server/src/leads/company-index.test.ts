import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../testing/db.js';
import { nameFromTitle, planQuery, queryWords, searchCompanyIndex, tldCountry, type IndexAsk } from './company-index.js';
import { recordCrawl } from './domain-cache.js';
import { domainHash } from './suppression.js';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.drop();
});
beforeEach(async () => {
  await db.sql`truncate domains, feed_items, suppressions cascade`;
});

const NOW = new Date('2026-10-20T12:00:00Z');

async function crawled(domain: string, pages: { path?: string; title: string; description?: string; text: string }[], status: 'done' | 'failed' | 'blocked' = 'done') {
  await db.sql.begin((tx) =>
    recordCrawl(
      tx,
      domain,
      {
        status,
        hasPersonal: false,
        generic: [],
        texts: pages.map((p) => ({ url: `https://${domain}${p.path ?? '/'}`, title: p.title, description: p.description ?? '', text: p.text })),
      },
      NOW,
    ),
  );
}

async function launch(domain: string, name: string, tagline: string) {
  await db.sql`
    insert into feed_items (source, source_ref, name, website, domain, tagline, search_text)
    values ('show_hn', ${domain}, ${name}, ${`https://${domain}`}, ${domain}, ${tagline}, ${`${name} ${tagline}`.toLowerCase()})
  `;
}

const plan = (core: string[], countries: string[] = []): IndexAsk['plan'] => ({
  core: core.map((q) => ({ q, country: countries[0] })),
  adjacent: [],
  wider: [],
  countries,
});

describe('company index words', () => {
  it('drops Brave operators and splits words', () => {
    expect(queryWords('"B2B appointment-setting" agency site:clutch.co -jobs OR')).toEqual(['b2b', 'appointment', 'setting', 'agency']);
  });

  it('reads the country from a TLD, not from the ones used as words', () => {
    expect(tldCountry('acme.de')).toBe('de');
    expect(tldCountry('acme.co.uk')).toBe('gb');
    expect(tldCountry('acme.io')).toBeNull();
    expect(tldCountry('acme.com')).toBeNull();
  });

  it('takes the name from the part of the title that names the site', () => {
    expect(nameFromTitle('Home | Acme Outbound', 'acmeoutbound.com')).toBe('Acme Outbound');
    expect(nameFromTitle('Cold email that books meetings', 'acme.com')).toBe('Cold email that books meetings');
    expect(nameFromTitle('', 'www.acme.com')).toBe('acme.com');
  });

  it('asks every query with all its words, in the simple and the English form', async () => {
    const q = await planQuery(db.sql, plan(['cold email agencies', 'Kaltakquise Agentur']));
    expect(q).toBe("('cold' & 'email' & ('agencies' | 'agenc')) | (('kaltakquise' | 'kaltakquis') & 'agentur')");
    expect(await planQuery(db.sql, plan(['the for']))).toBeNull();
  });
});

describe('company index search', () => {
  it('finds crawled companies and launches by the plan words, best rank first, with the homepage kept', async () => {
    await crawled('acme.com', [
      { title: 'Acme | Cold email agency', description: 'We run cold email for B2B companies', text: 'Cold email agency. Write to jane.doe@acme.com or info@acme.com.' },
      { path: '/about', title: 'About Acme', text: 'A small agency.' },
    ]);
    await crawled('textonly.com', [{ title: 'Textonly', text: 'Among other things we send cold email for agencies and their clients.' }]);
    await crawled('bakery.com', [{ title: 'Bakery', text: 'Bread and cakes' }]);
    await launch('launchco.io', 'LaunchCo', 'Cold email agency in a box');

    const found = await searchCompanyIndex(db.sql, { plan: plan(['cold email agencies']), limit: 10 });
    expect(found.map((c) => c.domain)).toEqual(['acme.com', 'launchco.io', 'textonly.com']);
    expect(found[0]).toMatchObject({
      name: 'Acme',
      website: 'https://acme.com',
      head: { title: 'Acme | Cold email agency', description: 'We run cold email for B2B companies' },
      from: 'pages',
    });
    // Never an address, in the snippet or in the index itself.
    expect(found[0]!.snippet).toBe('Cold email agency. Write to or');
    expect(found[1]).toMatchObject({ name: 'LaunchCo', snippet: 'Cold email agency in a box', from: 'feed' });
    expect(found[1]!.head).toBeUndefined();
    const vectors = await db.sql<{ v: string }[]>`select search::text as v from domain_pages union all select search::text from feed_items`;
    expect(vectors.some((r) => r.v.includes('@') || r.v.includes('jane'))).toBe(false);
  });

  it('matches words in the language a site uses', async () => {
    await crawled('kalt.de', [{ title: 'Kalt GmbH', text: 'Ihre Agentur für Kaltakquise im B2B' }]);
    const found = await searchCompanyIndex(db.sql, { plan: plan(['Kaltakquise Agentur'], ['de']), limit: 10 });
    expect(found.map((c) => c.domain)).toEqual(['kalt.de']);
  });

  it('leaves out excluded, suppressed, failed and other country sites', async () => {
    const page = [{ title: 'Cold email agency', text: 'cold email agency' }];
    await crawled('held.com', page);
    await crawled('optout.com', page);
    await crawled('broken.com', page);
    await crawled('agency.fr', page);
    await crawled('agency.de', page);
    await crawled('generic.io', page);
    await launch('blockedlaunch.com', 'Blocked', 'cold email agency');
    await db.sql`insert into domains (domain, crawl_status, crawled_at, recheck_at) values ('blockedlaunch.com', 'blocked', now(), now())`;
    await db.sql`update domains set crawl_status = 'failed' where domain = 'broken.com'`;
    await db.sql`insert into suppressions (hash, kind) values (${domainHash('optout.com')}, 'domain')`;

    const found = await searchCompanyIndex(db.sql, { plan: plan(['cold email agency'], ['de']), exclude: ['held.com'], limit: 10 });
    expect(found.map((c) => c.domain).sort()).toEqual(['agency.de', 'generic.io']);
    // Without countries every TLD passes.
    const anywhere = await searchCompanyIndex(db.sql, { plan: plan(['cold email agency']), limit: 10 });
    expect(anywhere.map((c) => c.domain).sort()).toEqual(['agency.de', 'agency.fr', 'generic.io', 'held.com']);
  });

  it('keeps one company per site and stops at the limit', async () => {
    await crawled('acme.com', [{ title: 'Acme cold email agency', text: 'cold email agency' }]);
    await launch('acme.com', 'Acme', 'cold email agency');
    await crawled('beta.com', [{ title: 'Beta', text: 'cold email agency' }]);
    const found = await searchCompanyIndex(db.sql, { plan: plan(['cold email agency']), limit: 1 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ domain: 'acme.com', from: 'both', name: 'Acme' });
  });
});
