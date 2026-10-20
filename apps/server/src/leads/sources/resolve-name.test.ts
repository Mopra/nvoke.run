import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { fakeFetch, silentLog, type FakeRoute } from '../../testing/fakes.js';
import type { CrawlDeps } from '../crawl.js';
import { RateLimiter } from '../limits.js';
import { RobotsCache } from '../robots.js';
import {
  WIKIDATA_API,
  brandMatches,
  countryTld,
  guessDomain,
  guessHosts,
  isMapListed,
  isParkedPage,
  knownDomain,
  lookedUpRef,
  nameResolver,
  resetWikidataPause,
  storedNameVariants,
  wikidataDomain,
} from './resolve-name.js';

const signal = new AbortController().signal;
const ctx = { signal, log: silentLog };

/** A homepage with the given title and body. */
function page(title: string, body = '', head = ''): FakeRoute {
  return { body: `<html><head><title>${title}</title>${head}</head><body>${body}</body></html>` };
}

/** Crawl deps over a fake web: no waiting, robots.txt answered by the routes (404 allows all). */
function web(routes: Record<string, FakeRoute>) {
  const fetch = fakeFetch(routes);
  const limiter = new RateLimiter(0);
  const deps: CrawlDeps = { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
  return { fetch, deps, homepages: () => fetch.calls.filter((c) => !c.url.endsWith('/robots.txt')).map((c) => c.url) };
}

/** DNS that knows only the given hosts, recording every lookup. */
function dns(known: string[]) {
  const asked: string[] = [];
  return { asked, lookupHost: async (host: string) => (asked.push(host), known.includes(host)) };
}

describe('names and guessed domains', () => {
  it('spells a stored name with and without legal endings', () => {
    const v = storedNameVariants('Acme Dental ApS');
    expect(v).toContain('acme dental aps');
    expect(v).toContain('acme dental');
    expect(v).toContain('acme dental, inc.');
    expect(storedNameVariants('  Pleo  ')).toContain('pleo a/s');
  });

  it('guesses the country TLD first, then .com, within the cap', () => {
    expect(guessHosts('Acme Dental ApS', 'dk', 6)).toEqual(['acmedental.dk', 'acme-dental.dk', 'acmedental.com', 'acme-dental.com', 'acmedental.net', 'acme-dental.net']);
    expect(guessHosts('Søstrene Grene', 'dk', 3)).toEqual(['soestrenegrene.dk', 'soestrene-grene.dk', 'sostrenegrene.dk']);
    expect(guessHosts('Pleo', undefined, 6)).toEqual(['pleo.com', 'pleo.net', 'pleo.io', 'pleo.co', 'pleo.org']);
    expect(guessHosts('Bo', 'dk', 6)).toEqual([]);
    expect(guessHosts('Acme Ltd', 'gb', 2)).toEqual(['acme.co.uk', 'acme.com']);
    expect(countryTld('us')).toBeNull();
  });

  it('reads the brand from the title, site name, logo and copyright line', () => {
    expect(brandMatches('Acme Dental ApS', '<title>Acme Dental | Tandlæge i Aarhus</title>')).toBe(true);
    expect(brandMatches('Acme Dental', '<title>Welcome to Acme Dental</title>')).toBe(true);
    expect(brandMatches('Pleo', '<title>Pleo \u2013 Smart company cards</title>')).toBe(true);
    expect(brandMatches('Pleo', '<head><meta property="og:site_name" content="Pleo"></head><title>Home</title>')).toBe(true);
    expect(brandMatches('Pleo', '<body><img class="site-logo" alt="Pleo logo"></body>')).toBe(true);
    expect(brandMatches('Acme Dental ApS', '<body><footer>\u00a9 2024 Acme Dental ApS. All rights reserved</footer></body>')).toBe(true);
    // One word must be a part of its own, and a host name in the title is not a brand.
    expect(brandMatches('Lunar', '<title>Lunar Eclipse Photography</title>')).toBe(false);
    expect(brandMatches('Acme Dental', '<title>acmedental.com</title>')).toBe(false);
    expect(brandMatches('Acme Dental', '<title>Smile Clinic</title>')).toBe(false);
    // The niche is not what tells a place apart.
    expect(brandMatches('Tandlæge Jensen', '<title>Welcome to Tandlæge Jensen</title>', ['dentists', 'tandlæge'])).toBe(false);
    expect(brandMatches('Tandlæge Jensen', '<title>Tandlæge Jensen | Aarhus</title>', ['dentists', 'tandlæge'])).toBe(true);
  });

  it('knows a parked domain', () => {
    expect(isParkedPage('<p>This domain may be for sale!</p>')).toBe(true);
    expect(isParkedPage('<script src="https://sedoparking.com/x.js"></script>')).toBe(true);
    expect(isParkedPage('<p>Book a cleaning today</p>')).toBe(false);
  });
});

describe('guess route', () => {
  it('takes the first resolving host whose homepage carries the name', async () => {
    const w = web({ 'https://acmedental.dk/': page('Acme Dental | Aarhus') });
    const d = dns(['acmedental.dk']);
    const domain = await guessDomain({ name: 'Acme Dental ApS', country: 'dk' }, { deps: w.deps, lookupHost: d.lookupHost, signal });
    expect(domain).toBe('acmedental.dk');
    expect(d.asked).toHaveLength(6);
    expect(w.homepages()).toEqual(['https://acmedental.dk/']);
    expect(w.fetch.calls[0]!.headers['user-agent']).toMatch(/^nvokebot/);
  });

  it('fetches at most two homepages and skips parked and unrelated pages', async () => {
    const w = web({
      'https://acmedental.dk/': page('acmedental.dk', 'This domain is for sale. Make an offer on this domain.'),
      'https://acme-dental.dk/': page('Smile Clinic'),
      'https://acmedental.com/': page('Acme Dental'),
    });
    const d = dns(['acmedental.dk', 'acme-dental.dk', 'acmedental.com']);
    expect(await guessDomain({ name: 'Acme Dental', country: 'dk' }, { deps: w.deps, lookupHost: d.lookupHost, signal })).toBeNull();
    expect(w.homepages()).toEqual(['https://acmedental.dk/', 'https://acme-dental.dk/']);
  });

  it('follows a redirect to the real domain, but not to a parking lot or a platform', async () => {
    const w = web({
      'https://acmedental.dk/': { status: 301, headers: { location: 'https://www.acme-group.com/dk' } },
      'https://www.acme-group.com/dk': page('Acme Dental'),
      'https://parked.dk/': { status: 302, headers: { location: 'https://sedo.com/search?domain=parked.dk' } },
      'https://sedo.com/search': page('Parked'),
      'https://facebookco.dk/': { status: 302, headers: { location: 'https://www.facebook.com/facebookco' } },
      'https://www.facebook.com/facebookco': page('Facebookco'),
    });
    const guess = (name: string, known: string[]) => guessDomain({ name, country: 'dk' }, { deps: w.deps, lookupHost: dns(known).lookupHost, signal });
    expect(await guess('Acme Dental', ['acmedental.dk'])).toBe('acme-group.com');
    expect(await guess('Parked', ['parked.dk'])).toBeNull();
    expect(await guess('Facebookco', ['facebookco.dk'])).toBeNull();
  });

  it('respects robots.txt and wants a place page to name its town', async () => {
    const w = web({
      'https://closed.dk/robots.txt': { body: 'User-agent: *\nDisallow: /', headers: { 'content-type': 'text/plain' } },
      'https://closed.dk/': page('Closed'),
      'https://tandlaegejensen.dk/': page('Tandlæge Jensen', '<p>Vestergade 1, 8000 Aarhus C</p>'),
    });
    const lookupHost = async () => true;
    expect(await guessDomain({ name: 'Closed', country: 'dk' }, { deps: w.deps, lookupHost, signal, maxLookups: 1 })).toBeNull();
    expect(w.homepages()).not.toContain('https://closed.dk/');
    const generic = ['dentists', 'tandlæge'];
    const jensen = (city: string) => guessDomain({ name: 'Tandlæge Jensen', country: 'dk', city, generic: [...generic, city] }, { deps: w.deps, lookupHost, signal, maxLookups: 1 });
    expect(await jensen('Aarhus')).toBe('tandlaegejensen.dk');
    expect(await jensen('Odense')).toBeNull();
    // A name of only the niche's words is anybody's.
    expect(await guessDomain({ name: 'Tandlægen', country: 'dk', generic }, { deps: w.deps, lookupHost, signal })).toBeNull();
  });
});

describe('wikidata route', () => {
  const wikidata = (search: unknown[], entities: Record<string, unknown>) => {
    const fetch = fakeFetch({
      [WIKIDATA_API]: (url) => ({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(url.searchParams.get('action') === 'wbsearchentities' ? { search } : { entities }),
      }),
    });
    return { fetch, opts: { url: WIKIDATA_API, fetch, limiter: new RateLimiter(0), signal } };
  };
  const site = (url: string, rank = 'normal') => ({ rank, mainsnak: { datavalue: { value: url } } });
  const isA = (id: string) => ({ mainsnak: { datavalue: { value: { id } } } });

  beforeEach(() => resetWikidataPause());

  it('reads the official website of the one item labeled with the name', async () => {
    const w = wikidata([{ id: 'Q818846', label: 'Novo Nordisk' }, { id: 'Q1', label: 'Novo Nordisk Foundation' }], {
      Q818846: { claims: { P31: [isA('Q891723')], P856: [site('https://old.example', 'deprecated'), site('https://www.novonordisk.com/')] } },
    });
    expect(await wikidataDomain({ name: 'Novo Nordisk A/S', country: 'dk' }, w.opts)).toBe('novonordisk.com');
    const [search, get] = w.fetch.calls.map((c) => new URL(c.url));
    expect(search!.searchParams.get('language')).toBe('da');
    expect(get!.searchParams.get('ids')).toBe('Q818846');
    expect(w.fetch.calls[0]!.headers['user-agent']).toMatch(/^nvokebot/);
  });

  it('answers nothing for short names, people, websites without the name or items that disagree', async () => {
    const none = wikidata([], {});
    expect(await wikidataDomain({ name: 'Pleo' }, none.opts)).toBeNull();
    expect(none.fetch.calls).toHaveLength(0);

    const person = wikidata([{ id: 'Q2', label: 'Karen Blixen' }], { Q2: { claims: { P31: [isA('Q5')], P856: [site('https://karenblixen.com')] } } });
    expect(await wikidataDomain({ name: 'Karen Blixen' }, person.opts)).toBeNull();

    const elsewhere = wikidata([{ id: 'Q3', label: 'Carlsberg Group' }], { Q3: { claims: { P856: [site('https://www.beer.example')] } } });
    expect(await wikidataDomain({ name: 'Carlsberg Group' }, elsewhere.opts)).toBeNull();

    const two = wikidata([{ id: 'Q4', label: 'Mercury Labs' }, { id: 'Q5', label: 'Mercury Labs' }], {
      Q4: { claims: { P856: [site('https://mercurylabs.com')] } },
      Q5: { claims: { P856: [site('https://mercurylabs.io')] } },
    });
    expect(await wikidataDomain({ name: 'Mercury Labs' }, two.opts)).toBeNull();
  });

  it('rests after Wikidata refuses us', async () => {
    const fetch = fakeFetch({ [WIKIDATA_API]: { status: 429, body: 'slow down' } });
    const opts = { url: WIKIDATA_API, fetch, limiter: new RateLimiter(0), signal };
    await expect(wikidataDomain({ name: 'Novo Nordisk' }, opts)).rejects.toThrow();
    expect(await wikidataDomain({ name: 'Novo Nordisk' }, opts)).toBeNull();
    expect(fetch.calls).toHaveLength(1);
  });
});

describe('known route and the resolver', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
    await db.sql`insert into accounts (clerk_user_id) values ('user_1')`;
    const [search] = await db.sql<{ id: string }[]>`insert into searches (clerk_user_id, kind, "limit") values ('user_1', 'local', 10) returning id`;
    const company = (name: string, domain: string, source: string, location: string | null = null, sourceRef: string | null = null) =>
      db.sql`insert into companies (search_id, clerk_user_id, name, domain, website, source, source_ref, location)
             values (${search!.id}, 'user_1', ${name}, ${domain}, ${`https://${domain}/`}, ${source}, ${sourceRef}, ${location})`;
    await company('Acme Dental ApS', 'acmedental.dk', 'brave');
    await company('Ghost Co', 'first-hit.dk', 'brave');
    await company('Tandlæge Jensen', 'jensen-tand.dk', 'osm', 'Vestergade 1, 8000 Aarhus');
    await company('Down Ltd', 'down.dk', 'list');
    // A map place that listed no website, whose website a guess found: not the map's word.
    await company('Tandlæge Holm', 'wrong-guess.dk', 'osm', 'Bygade 2, 8000 Aarhus', 'node/9#guess');
    await company('Tandlæge Berg', 'klinik-nord.dk', 'osm', 'Bygade 3, 8000 Aarhus', 'node/10');
    await db.sql`insert into domains (domain, crawl_status, crawled_at, recheck_at) values
      ('acmedental.dk', 'done', now(), now() + interval '90 days'),
      ('first-hit.dk', 'done', now(), now() + interval '90 days'),
      ('jensen-tand.dk', 'js_only', now(), now() + interval '7 days'),
      ('wrong-guess.dk', 'done', now(), now() + interval '90 days'),
      ('klinik-nord.dk', 'done', now(), now() + interval '90 days'),
      ('down.dk', 'failed', now(), now() + interval '7 days')`;
  });
  afterAll(async () => db?.drop());

  it('finds a name a past search found, when the domain holds the name or the map listed it', async () => {
    expect(await knownDomain(db.sql, { name: 'acme dental' })).toBe('acmedental.dk');
    expect(await knownDomain(db.sql, { name: 'Acme Dental A/S' })).toBe('acmedental.dk');
    // A Brave fallback that does not look like the name proves nothing, nor does a site the crawl never reached.
    expect(await knownDomain(db.sql, { name: 'Ghost Co' })).toBeNull();
    expect(await knownDomain(db.sql, { name: 'Down' })).toBeNull();
    const generic = ['dentists', 'tandlæge'];
    expect(await knownDomain(db.sql, { name: 'Tandlæge Jensen', city: 'Aarhus', generic })).toBe('jensen-tand.dk');
    expect(await knownDomain(db.sql, { name: 'Tandlæge Jensen', city: 'Odense', generic })).toBeNull();
  });

  it('trusts only websites the map listed, not ones a lookup stored on a map place', async () => {
    const generic = ['dentists', 'tandlæge'];
    expect(await knownDomain(db.sql, { name: 'Tandlæge Holm', generic })).toBeNull();
    expect(await knownDomain(db.sql, { name: 'Tandlæge Holm', city: 'Aarhus', generic })).toBeNull();
    expect(await knownDomain(db.sql, { name: 'Tandlæge Berg', generic })).toBe('klinik-nord.dk');
    expect(isMapListed('osm', 'node/10')).toBe(true);
    expect(isMapListed('osm', lookedUpRef('node/9', 'brave'))).toBe(false);
    expect(isMapListed('brave', null)).toBe(false);
  });

  it('tries known, then guess, then Wikidata, and answers null when none is sure', async () => {
    const w = web({ 'https://pleo.io/': page('Pleo | Spend management') });
    const d = dns(['pleo.io']);
    const resolver = nameResolver({ sql: db.sql, crawl: w.deps, lookupHost: d.lookupHost, wikidata: false });
    expect(await resolver.resolve({ name: 'Acme Dental' }, ctx)).toEqual({ domain: 'acmedental.dk', website: 'https://acmedental.dk/', route: 'known' });
    expect(d.asked).toEqual([]);
    expect(await resolver.resolve({ name: 'Pleo' }, ctx)).toEqual({ domain: 'pleo.io', website: 'https://pleo.io/', route: 'guess' });
    expect(await resolver.resolve({ name: 'Nobody Here' }, ctx)).toBeNull();
    expect(await resolver.resolve({ name: 'ApS' }, ctx)).toBeNull();

    resetWikidataPause();
    const wd = fakeFetch({
      [WIKIDATA_API]: (url) => ({
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          url.searchParams.get('action') === 'wbsearchentities'
            ? { search: [{ id: 'Q7', label: 'Vestas Wind Systems' }] }
            : { entities: { Q7: { claims: { P856: [{ mainsnak: { datavalue: { value: 'https://www.vestaswindsystems.com/' } } }] } } } },
        ),
      }),
    });
    const withWikidata = nameResolver({ crawl: w.deps, lookupHost: async () => false, fetch: wd, wikidataLimiter: new RateLimiter(0) });
    expect((await withWikidata.resolve({ name: 'Vestas Wind Systems' }, ctx))?.route).toBe('wikidata');
  });
});
