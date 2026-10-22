import { gzipSync } from 'node:zlib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from '../../testing/db.js';
import { domainHash } from '../suppression.js';
import { CcFetcher, ccList, ccLoad, ccLoaded, homeHead } from './cc-load.js';
import { domainGroups, parseCdxLine, pickPages, warcHtml, type ListedDomain } from './common-crawl.js';

const NOW = new Date('2026-10-22T12:00:00Z');

/** A CDX line as the index has it. */
function cdx(url: string, fields: Record<string, string> = {}, timestamp = '20261012083015'): string {
  const host = new URL(url).hostname.replace(/^www\./, '').split('.').reverse().join(',');
  const json = { url, mime: 'text/html', 'mime-detected': 'text/html', status: '200', length: '1000', offset: '42', filename: 'crawl-data/x.warc.gz', ...fields };
  return `${host})${new URL(url).pathname} ${timestamp} ${JSON.stringify(json)}`;
}

/** A gzipped WARC response record holding `html`. */
function record(html: string, contentType = 'text/html; charset=utf-8'): Buffer {
  return gzipSync(Buffer.from(`WARC/1.0\r\nWARC-Type: response\r\n\r\nHTTP/1.1 200 OK\r\nContent-Type: ${contentType}\r\n\r\n${html}`, 'latin1'));
}

const BUSINESS = (name: string) =>
  `<html><head><title>${name} | Dental clinic in Berlin</title><meta name="description" content="${name} treats teeth for the whole family."></head>` +
  `<body><h1>${name}</h1><p>${'We fix teeth, clean teeth and make them white. '.repeat(20)}</p><p>Write to info@${name.toLowerCase()}.de</p></body></html>`;

/** A fetch that serves records by file name and answers the scripted statuses first. */
function fakeFetch(files: Map<string, Buffer>, statuses: number[] = []) {
  const calls: string[] = [];
  const fn = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const status = statuses.shift();
    if (status) return new Response('no', { status });
    const body = files.get(url.slice(url.lastIndexOf('/') + 1));
    return body ? new Response(new Uint8Array(body), { status: 206 }) : new Response('missing', { status: 404 });
  }) as typeof fetch;
  return { fn, calls };
}

function listed(domain: string, file: string, at = '2026-10-12T08:30:15Z'): ListedDomain {
  return { domain, home: { url: `https://www.${domain}/`, filename: `crawl-data/${file}`, offset: 0, length: 1, at } };
}

describe('the CDX index', () => {
  it('parses a line with its capture time', () => {
    expect(parseCdxLine(cdx('https://acme.de/', { status: '301', redirect: 'https://www.acme.de/' }))).toMatchObject({
      url: 'https://acme.de/',
      timestamp: '20261012083015',
      status: '301',
      redirect: 'https://www.acme.de/',
      offset: 42,
    });
    expect(parseCdxLine('garbage')).toBeNull();
  });

  it('groups the lines by registrable domain, subdomains with their site', async () => {
    const groups = [];
    for await (const g of domainGroups([cdx('https://acme.de/'), cdx('https://shop.acme.de/cart'), cdx('https://beta.co.uk/'), 'bad line', cdx('https://www.beta.co.uk/about')])) {
      groups.push([g.domain, g.captures.length]);
    }
    expect(groups).toEqual([
      ['acme.de', 2],
      ['beta.co.uk', 2],
    ]);
    // A domain turned down holds none of its captures.
    const skipped = [];
    for await (const g of domainGroups([cdx('https://acme.de/'), cdx('https://beta.co.uk/')], (d) => d === 'acme.de')) skipped.push([g.domain, g.captures.length]);
    expect(skipped).toEqual([
      ['acme.de', 0],
      ['beta.co.uk', 1],
    ]);
  });

  it('picks the homepage on the site itself, and the best contact and about pages', () => {
    const caps = [
      cdx('https://shop.acme.de/'),
      cdx('https://www.acme.de/'),
      cdx('https://www.acme.de/kontakt'),
      cdx('https://www.acme.de/ueber-uns'),
      cdx('https://www.acme.de/blog/post-1'),
    ].map((l) => parseCdxLine(l)!);
    const picked = pickPages('acme.de', caps)!;
    expect(picked.home).toEqual({ url: 'https://www.acme.de/', filename: 'crawl-data/x.warc.gz', offset: 42, length: 1000, at: '2026-10-12T08:30:15Z' });
    expect(picked.contact?.url).toBe('https://www.acme.de/kontakt');
    expect(picked.about?.url).toBe('https://www.acme.de/ueber-uns');
  });

  it('follows a same site redirect of the homepage to its captured target, not one to another site', () => {
    const moved = ['https://acme.de/', 'https://www.acme.de/en/'].map((u, i) =>
      parseCdxLine(i === 0 ? cdx(u, { status: '301', redirect: 'https://www.acme.de/en/' }) : cdx(u))!,
    );
    expect(pickPages('acme.de', moved)?.home.url).toBe('https://www.acme.de/en/');
    const away = [parseCdxLine(cdx('https://acme.de/', { status: '301', redirect: 'https://other.com/' }))!, parseCdxLine(cdx('https://acme.de/products'))!];
    expect(pickPages('acme.de', away)).toBeNull();
    expect(pickPages('acme.de', [parseCdxLine(cdx('https://acme.de/', { status: '404' }))!])).toBeNull();
  });
});

describe('a homepage record', () => {
  it('reads the HTML in the charset the response names', () => {
    expect(warcHtml(record('<p>caf\xe9</p>', 'text/html; charset=iso-8859-1'))).toBe('<p>café</p>');
    expect(warcHtml(gzipSync(Buffer.from('WARC/1.0\r\n\r\nno http')))).toBeNull();
  });

  it('keeps title, description and 600 characters of text, drops parked, walled and empty pages', () => {
    const head = homeHead(BUSINESS('Smile'), 'https://smile.de/');
    expect(head).toMatchObject({ title: 'Smile | Dental clinic in Berlin', description: 'Smile treats teeth for the whole family.' });
    expect('text' in head && head.text.length).toBe(600);
    expect(homeHead('<html><head><title>example.com is for sale</title></head><body>This domain is for sale! Buy this domain.</body></html>', 'https://x.com/')).toEqual({ drop: 'parked' });
    expect(homeHead('<html><head><title>Just a moment...</title></head><body></body></html>', 'https://x.com/')).toEqual({ drop: 'wall' });
    expect(homeHead('<html><head><title>One moment, please...</title></head><body>Please wait while your request is being verified...</body></html>', 'https://x.com/')).toEqual({ drop: 'wall' });
    expect(homeHead('<html><body><p>Hello</p></body></html>', 'https://x.com/')).toEqual({ drop: 'empty' });
    expect(homeHead('<html><head><title>Coming soon</title></head><body>Our new site is coming soon.</body></html>', 'https://x.com/')).toEqual({ drop: 'empty' });
    expect(homeHead('%PDF-1.4 binary', 'https://x.com/')).toEqual({ drop: 'not_html' });
    // A short page with a real title stays: the title alone names the trade.
    expect(homeHead('<html><head><title>Jansen Roofing, Utrecht</title></head><body>Call us.</body></html>', 'https://x.nl/')).toMatchObject({ title: 'Jansen Roofing, Utrecht' });
  });
});

describe('CcFetcher', () => {
  it('pauses every request after a 403 and retries', async () => {
    const files = new Map([['a.warc.gz', Buffer.from('ok')]]);
    const { fn, calls } = fakeFetch(files, [403, 503]);
    const waits: number[] = [];
    const fetcher = new CcFetcher({ rate: 1000, fetch: fn, sleep: async (ms) => void waits.push(ms) });
    // The fake sleep returns at once, so the pause is seen as repeated waits rather than time passing.
    const realNow = Date.now;
    let clock = realNow();
    Date.now = () => (clock += 1000);
    try {
      expect((await fetcher.range('crawl-data/a.warc.gz', 0, 2)).toString()).toBe('ok');
    } finally {
      Date.now = realNow;
    }
    expect(calls).toHaveLength(3);
    expect(fetcher.stats).toMatchObject({ requests: 1, retries: 2, blocked: 1 });
    expect(waits.length).toBeGreaterThan(0);
  });

  it('gives up on a missing file at once', async () => {
    const { fn, calls } = fakeFetch(new Map());
    await expect(new CcFetcher({ fetch: fn }).range('crawl-data/none.warc.gz', 0, 2)).rejects.toThrow('404');
    expect(calls).toHaveLength(1);
  });
});

describe('ccList', () => {
  it('lists the domains of random index blocks with a homepage, leaving out the filtered and the block ends', async () => {
    const block = [
      cdx('https://first.com/'),
      cdx('https://acme.de/'),
      cdx('https://www.acme.de/kontakt'),
      cdx('https://nohome.de/blog/1'),
      cdx('https://hamburg.gov.de/'),
      cdx('https://smile.dk/'),
      cdx('https://last.com/'),
    ].join('\n');
    const gz = gzipSync(block);
    const files = new Map([
      ['cluster.idx', Buffer.from(`com,first)/ 20261012\tcdx-00001.gz\t0\t${gz.length}\t1\n`)],
      ['cdx-00001.gz', gz],
    ]);
    const out: ListedDomain[] = [];
    const stats = await ccList({ crawl: 'CC-MAIN-2026-43', fetcher: new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn }), blocks: 1, write: (d) => void out.push(d) });
    expect(out.map((d) => d.domain)).toEqual(['acme.de', 'smile.dk']);
    expect(out[0]!.contact?.url).toBe('https://www.acme.de/kontakt');
    expect(stats).toEqual({ domains: 4, filtered: 1, noHomepage: 1, listed: 2 });
  });

  it('reads whole shards as a stream, every domain of them', async () => {
    const files = new Map([['cdx-00007.gz', gzipSync([cdx('https://acme.de/'), cdx('https://smile.dk/')].join('\n'))]]);
    const out: ListedDomain[] = [];
    const stats = await ccList({ crawl: 'CC-MAIN-2026-43', fetcher: new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn }), shards: ['cdx-00007.gz'], write: (d) => void out.push(d) });
    expect(out.map((d) => d.domain)).toEqual(['acme.de', 'smile.dk']);
    expect(stats.listed).toBe(2);
  });
});

describe('ccLoad', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await db.sql`delete from domains`;
    await db.sql`delete from suppressions`;
  });

  const files = new Map([
    ['smile.warc.gz', record(BUSINESS('Smile'))],
    ['roof.warc.gz', record(BUSINESS('Roof'))],
    ['parked.warc.gz', record('<html><head><title>parked.com</title></head><body>This domain is for sale! Buy this domain.</body></html>')],
    ['crawled.warc.gz', record(BUSINESS('Crawled'))],
    ['blocked.warc.gz', record(BUSINESS('Blocked'))],
  ]);
  const list = [
    listed('smile.de', 'smile.warc.gz'),
    listed('parked.com', 'parked.warc.gz'),
    listed('crawled.de', 'crawled.warc.gz'),
    listed('blocked.de', 'blocked.warc.gz'),
    listed('gone.de', 'gone.warc.gz'),
    listed('roof.nl', 'roof.warc.gz'),
  ];

  it('writes the homepages into the index, due for a crawl, and skips the known, suppressed, dead and missing', async () => {
    await db.sql`insert into domains (domain, crawl_status, crawled_at, recheck_at) values ('crawled.de', 'done', ${NOW}, ${NOW})`;
    await db.sql`insert into suppressions (kind, hash, source) values ('domain', ${domainHash('blocked.de')}, 'admin')`;
    const fetcher = new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn, sleep: async () => {} });
    const progress: number[] = [];
    const stats = await ccLoad(db.sql, list, { crawl: 'CC-MAIN-2026-43', fetcher, limit: 10, now: () => NOW, onProgress: (s) => void progress.push(s.read) });

    expect(stats).toEqual({ read: 6, known: 2, failed: 1, dropped: { parked: 1, wall: 0, empty: 0, not_html: 0 }, added: 2 });
    expect(progress).toEqual([6]);
    const rows = await db.sql`
      select d.domain, d.crawl_status, d.recheck_at = d.crawled_at as due, p.url, p.title, length(p.text) as text, i.crawl, p.search is not null as indexed
      from index_imports i join domains d using (domain) join domain_pages p using (domain) order by d.domain
    `;
    expect(rows).toEqual([
      { domain: 'roof.nl', crawl_status: 'done', due: true, url: 'https://www.roof.nl/', title: 'Roof | Dental clinic in Berlin', text: 600, crawl: 'CC-MAIN-2026-43', indexed: true },
      { domain: 'smile.de', crawl_status: 'done', due: true, url: 'https://www.smile.de/', title: 'Smile | Dental clinic in Berlin', text: 600, crawl: 'CC-MAIN-2026-43', indexed: true },
    ]);
    expect(await ccLoaded(db.sql)).toMatchObject([{ crawl: 'CC-MAIN-2026-43', domains: 2 }]);
    // A domain a crawl of ours read keeps that crawl.
    const [crawl] = await db.sql`select crawl_status from domains where domain = 'crawled.de'`;
    expect(crawl).toEqual({ crawl_status: 'done' });
  });

  it('stops after the batch that reaches the limit and goes on from where an earlier run stopped', async () => {
    const fetcher = new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn, sleep: async () => {} });
    const first = await ccLoad(db.sql, list, { crawl: 'CC-MAIN-2026-43', fetcher, limit: 1, batch: 2 });
    expect(first).toMatchObject({ read: 2, added: 1 });
    const second = await ccLoad(db.sql, list, { crawl: 'CC-MAIN-2026-43', fetcher, limit: 10, skip: first.read });
    expect(second).toMatchObject({ read: 6, added: 3 });
    const domains = await db.sql<{ domain: string }[]>`select domain from index_imports order by domain`;
    expect(domains.map((r) => r.domain)).toEqual(['blocked.de', 'crawled.de', 'roof.nl', 'smile.de']);
  });

  it('writes a domain listed twice in one batch once', async () => {
    const fetcher = new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn, sleep: async () => {} });
    const stats = await ccLoad(db.sql, [list[0]!, list[0]!, list[5]!], { crawl: 'CC-MAIN-2026-43', fetcher, limit: 10 });
    expect(stats).toMatchObject({ read: 3, known: 1, added: 2 });
  });

  it('erasing the domain drops its import row', async () => {
    const fetcher = new CcFetcher({ rate: 1000, fetch: fakeFetch(files).fn, sleep: async () => {} });
    await ccLoad(db.sql, [list[0]!], { crawl: 'CC-MAIN-2026-43', fetcher, limit: 1 });
    await db.sql`delete from domains where domain = 'smile.de'`;
    expect(await db.sql`select 1 from index_imports`).toHaveLength(0);
  });
});
