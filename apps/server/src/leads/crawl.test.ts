import { describe, expect, it } from 'vitest';
import { fakeFetch, fixture, type FakeRoute } from '../testing/fakes.js';
import { crawlSite, pickLikelyPages, sharePeopleText, type CrawlDeps } from './crawl.js';
import type { FetchLike } from './http.js';
import { RateLimiter } from './limits.js';
import { RobotsCache } from './robots.js';

function deps(fetch: FetchLike, intervalMs = 1): CrawlDeps {
  const limiter = new RateLimiter(intervalMs);
  return { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
}

const page = (body: string): FakeRoute => ({ body });

const HOME = `<html><body>
  <nav>
    <a href="/">Home</a>
    <a href="/kontakt">Kontakt</a>
    <a href="https://www.acme.dk/om-os">Om os</a>
    <a href="/team/">Vores team</a>
    <a href="/blog/2019/how-to-contact-us">Old blog post</a>
    <a href="/shop">Shop</a>
    <a href="/privatlivspolitik">Privatliv</a>
    <a href="/files/brochure.pdf">Contact brochure</a>
    <a href="https://facebook.com/acme">Facebook contact</a>
    <a href="mailto:info@acme.dk">Mail</a>
    <a href="tel:+4512345678">Ring</a>
    <a href="#contact">Jump</a>
  </nav>
  <p>Welcome.</p>
</body></html>`;

describe('pickLikelyPages', () => {
  it('picks same-site contact, about, team and legal pages, shallow first', () => {
    const picked = pickLikelyPages(HOME, 'https://acme.dk/', 7);
    expect(picked).toEqual([
      'https://acme.dk/kontakt',
      'https://acme.dk/team/',
      'https://www.acme.dk/om-os',
      'https://acme.dk/blog/2019/how-to-contact-us',
      'https://acme.dk/privatlivspolitik',
    ]);
  });

  it('respects the maximum', () => {
    expect(pickLikelyPages(HOME, 'https://acme.dk/', 2)).toHaveLength(2);
  });
});

describe('crawlSite', () => {
  it('fetches the homepage and likely pages and returns the company addresses', async () => {
    const fetch = fakeFetch({
      'https://acme.dk/robots.txt': { status: 404 },
      'https://www.acme.dk/robots.txt': { status: 404 },
      'https://acme.dk/': page(HOME),
      'https://acme.dk/kontakt': page('<p>Skriv: info@acme.dk eller ole [at] acme [dot] dk. Bureau: hello@agency.dk</p>'),
      'https://acme.dk/team/': page('<p>Mette, <a href="mailto:mette@acme.dk">mail</a></p>'),
      'https://www.acme.dk/om-os': page('<p>Om os</p>'),
      'https://acme.dk/privatlivspolitik': page('<p>Dataansvarlig: dpo@acme.dk</p>'),
    });
    const result = await crawlSite('https://acme.dk/', 'acme.dk', deps(fetch));
    expect(result.status).toBe('done');
    expect(result.emails.map((e) => e.address).sort()).toEqual(['dpo@acme.dk', 'info@acme.dk', 'mette@acme.dk', 'ole@acme.dk']);
    expect(result.emails.find((e) => e.address === 'mette@acme.dk')?.sourceUrl).toBe('https://acme.dk/team/');
    const pages = fetch.calls.filter((c) => !c.url.endsWith('/robots.txt'));
    expect(pages.length).toBeLessThanOrEqual(8);
    expect(pages.every((c) => c.headers['user-agent'] === 'nvokebot/1.0 (+https://nvoke.run/bot)')).toBe(true);
  });

  it('keeps the text of the homepage and the pages about the business, not contact, team or legal pages', async () => {
    const fetch = fakeFetch({
      'https://acme.dk/': page(`${HOME.replace('<p>Welcome.</p>', '<h1>Acme Tandklinik</h1><p>Open on Saturdays.</p>')}`),
      'https://acme.dk/kontakt': page('<p>info@acme.dk</p>'),
      'https://acme.dk/team/': page('<p>Mette Hansen</p>'),
      'https://www.acme.dk/om-os': page('<title>Om os</title><p>Since 1998 in Aarhus. Ask søren@acme.dk or ole [at] acme [dot] dk.</p><footer>Cookies</footer>'),
      'https://acme.dk/privatlivspolitik': page('<p>Dataansvarlig</p>'),
    });
    const result = await crawlSite('https://acme.dk/', 'acme.dk', deps(fetch));
    expect(result.texts.map((t) => t.url)).toEqual(['https://acme.dk/', 'https://www.acme.dk/om-os']);
    expect(result.texts[0]!.text).toContain('Open on Saturdays.');
    // Navigation and footers are not page text.
    expect(result.texts[0]!.text).not.toContain('Kontakt');
    // No addresses: the shared cache keeps none of a person's.
    expect(result.texts[1]).toMatchObject({ title: 'Om os', text: 'Since 1998 in Aarhus. Ask or .' });
  });

  it('returns the people the pages name, decision makers first, and the people pages text apart from the opener text', async () => {
    const fetch = fakeFetch({
      'https://acme.dk/': page(HOME.replace('<p>Welcome.</p>', '<p>Mette Hansen, CEO</p>')),
      'https://acme.dk/kontakt': page('<p>Skriv til info@acme.dk</p><p>Geschäftsführer: Ole Berg</p>'),
      'https://acme.dk/team/': page(
        '<div><h3>Sofie Lund</h3><p>Designer</p></div><div><h3>Jonas Kirk</h3><p>Head of Growth</p></div><div><h3>Mette Hansen</h3><p>Adm. direktør</p></div>',
      ),
      'https://www.acme.dk/om-os': page('<p>Since 1998 in Aarhus.</p>'),
      'https://acme.dk/privatlivspolitik': page('<p>Dataansvarlig</p>'),
    });
    const result = await crawlSite('https://acme.dk/', 'acme.dk', deps(fetch));
    expect(result.people.map((p) => [p.firstName, p.lastName, p.title, p.seniority])).toEqual([
      ['Mette', 'Hansen', 'CEO', 'founder'],
      ['Ole', 'Berg', 'Geschäftsführer', 'founder'],
      ['Jonas', 'Kirk', 'Head of Growth', 'director'],
      ['Sofie', 'Lund', 'Designer', 'staff'],
    ]);
    expect(result.people[0]!.sourceUrl).toBe('https://acme.dk/');
    expect(result.peopleTexts.map((t) => t.url)).toEqual(['https://acme.dk/team/', 'https://www.acme.dk/om-os']);
    expect(result.peopleTexts[0]!.text).toContain('Head of Growth');
    expect(result.texts.map((t) => t.url)).not.toContain('https://acme.dk/team/');
  });

  it('extracts from a realistic Danish contact page', async () => {
    const fetch = fakeFetch({
      'https://tandtorvet.dk/': page('<a href="/kontakt">Kontakt</a>'),
      'https://tandtorvet.dk/kontakt': page(fixture('sites/dentist-kontakt.html')),
    });
    const result = await crawlSite('https://tandtorvet.dk/', 'tandtorvet.dk', deps(fetch));
    const found = result.emails.map((e) => e.address);
    expect(found).toContain('info@tandtorvet.dk');
    expect(found).toContain('booking@tandtorvet.dk');
    // The web agency's address is dropped: the clinic has addresses of its own.
    expect(found).not.toContain('hello@webbureauet.dk');
  });

  it('never fetches more than 8 pages', async () => {
    const links = Array.from({ length: 20 }, (_, i) => `<a href="/kontakt-${i}">Kontakt ${i}</a>`).join('');
    const routes: Record<string, FakeRoute> = { 'https://big.dk/': page(links) };
    for (let i = 0; i < 20; i++) routes[`https://big.dk/kontakt-${i}`] = page(`<p>p${i}@big.dk</p>`);
    const fetch = fakeFetch(routes);
    const result = await crawlSite('https://big.dk/', 'big.dk', deps(fetch));
    const pages = fetch.calls.filter((c) => !c.url.endsWith('/robots.txt'));
    expect(pages).toHaveLength(8);
    expect(result.emails).toHaveLength(7);
  });

  it('stops at the 2 MB budget', async () => {
    const big = `<p>${'x'.repeat(1_500_000)}</p>`;
    const fetch = fakeFetch({
      'https://heavy.dk/': page(`<a href="/kontakt">Kontakt</a><a href="/about">About</a><a href="/team">Team</a>${big}`),
      'https://heavy.dk/kontakt': page(`<p>info@heavy.dk</p>${big}`),
      'https://heavy.dk/about': page('<p>late@heavy.dk</p>'),
      'https://heavy.dk/team': page('<p>later@heavy.dk</p>'),
    });
    const result = await crawlSite('https://heavy.dk/', 'heavy.dk', deps(fetch));
    expect(result.pages.find((p) => p.note === 'budget')).toBeDefined();
    const total = result.pages.reduce((n, p) => n + p.bytes, 0);
    expect(total).toBeLessThanOrEqual(2_000_000);
    expect(result.emails.map((e) => e.address)).not.toContain('later@heavy.dk');
  });

  it('is blocked when robots.txt disallows the homepage', async () => {
    const fetch = fakeFetch({
      'https://private.dk/robots.txt': page('User-agent: nvokebot\nDisallow: /'),
      'https://private.dk/': page('<p>secret@private.dk</p>'),
    });
    const result = await crawlSite('https://private.dk/', 'private.dk', deps(fetch));
    expect(result.status).toBe('blocked');
    expect(fetch.calls.map((c) => c.url)).toEqual(['https://private.dk/robots.txt']);
  });

  it('skips individual pages robots.txt disallows', async () => {
    const fetch = fakeFetch({
      'https://part.dk/robots.txt': page('User-agent: *\nDisallow: /team'),
      'https://part.dk/': page('<a href="/kontakt">Kontakt</a><a href="/team">Team</a>'),
      'https://part.dk/kontakt': page('<p>info@part.dk</p>'),
      'https://part.dk/team': page('<p>hidden@part.dk</p>'),
    });
    const result = await crawlSite('https://part.dk/', 'part.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['info@part.dk']);
    expect(fetch.calls.some((c) => c.url === 'https://part.dk/team')).toBe(false);
    expect(result.pages.find((p) => p.url === 'https://part.dk/team')?.note).toBe('robots');
  });

  it('checks robots.txt on every redirect hop', async () => {
    const fetch = fakeFetch({
      'https://old.dk/': { status: 301, headers: { location: 'https://newbrand.com/' } },
      'https://newbrand.com/robots.txt': page('User-agent: *\nDisallow: /'),
      'https://newbrand.com/': page('<p>info@newbrand.com</p>'),
    });
    const result = await crawlSite('https://old.dk/', 'old.dk', deps(fetch));
    expect(result.status).toBe('blocked');
    expect(fetch.calls.some((c) => c.url === 'https://newbrand.com/')).toBe(false);
  });

  it('follows a redirect to a new brand domain and treats it as the company site', async () => {
    const fetch = fakeFetch({
      'https://old.dk/': { status: 301, headers: { location: 'https://newbrand.com/' } },
      'https://newbrand.com/': page('<p>info@newbrand.com and agency@webshop.dk</p>'),
    });
    const result = await crawlSite('https://old.dk/', 'old.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['info@newbrand.com']);
  });

  it('falls back to http when https does not answer', async () => {
    const fetch = fakeFetch({ 'http://plain.dk/': page('<p>info@plain.dk</p>') }, { offline: [] });
    const failing: FetchLike = (input, init) =>
      String(input).startsWith('https://plain.dk') ? Promise.reject(new TypeError('connect ECONNREFUSED')) : fetch(input, init);
    const result = await crawlSite('https://plain.dk/', 'plain.dk', deps(failing));
    expect(result.status).toBe('done');
    expect(result.emails.map((e) => e.address)).toEqual(['info@plain.dk']);
  });

  it('fails when the site is down, and guesses common paths when the homepage links nowhere', async () => {
    const down = await crawlSite('https://gone.dk/', 'gone.dk', deps(fakeFetch({}, { offline: ['gone.dk'] })));
    expect(down.status).toBe('failed');

    const fetch = fakeFetch({
      'https://bare.dk/': page('<p>Welcome</p>'),
      'https://bare.dk/kontakt': page('<p>hej@bare.dk</p>'),
    });
    const result = await crawlSite('https://bare.dk/', 'bare.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['hej@bare.dk']);
  });

  it('is refused when the homepage answers 403 or a bot challenge, so the desktop may read it', async () => {
    const forbidden = await crawlSite('https://walled.dk/', 'walled.dk', deps(fakeFetch({ 'https://walled.dk/': { status: 403 } })));
    expect(forbidden.status).toBe('refused');

    const challenge = fakeFetch({
      'https://cf.dk/': page('<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={}</script></body></html>'),
    });
    const result = await crawlSite('https://cf.dk/', 'cf.dk', deps(challenge));
    expect(result.status).toBe('refused');
    expect(challenge.calls.filter((c) => !c.url.endsWith('/robots.txt'))).toHaveLength(1);
  });

  it('is js_only when nothing is found and the homepage is an app shell', async () => {
    const fetch = fakeFetch({
      'https://spa.dk/': page('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'),
    });
    const result = await crawlSite('https://spa.dk/', 'spa.dk', deps(fetch));
    expect(result.status).toBe('js_only');

    const found = fakeFetch({
      'https://spa2.dk/': page('<html><body><div id="root">info@spa2.dk</div><script src="/app.js"></script></body></html>'),
    });
    expect((await crawlSite('https://spa2.dk/', 'spa2.dk', deps(found))).status).toBe('done');
  });

  it('decodes legacy charsets', async () => {
    const latin1 = Buffer.from('<p>Kontakt Søren: søren@acme.dk eller info@acme.dk</p>', 'latin1').toString('latin1');
    const fetch: FetchLike = async (input) => {
      const url = String(input);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response(Buffer.from(latin1, 'latin1'), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } });
    };
    const result = await crawlSite('https://acme.dk/', 'acme.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['info@acme.dk']);
  });

  it('waits at least the interval between requests to one host', async () => {
    const stamps: number[] = [];
    const inner = fakeFetch({
      'https://slow.dk/': page('<a href="/kontakt">k</a><a href="/about">a</a>'),
      'https://slow.dk/kontakt': page('<p>x@slow.dk</p>'),
      'https://slow.dk/about': page('<p>y@slow.dk</p>'),
    });
    const fetch: FetchLike = (input, init) => {
      stamps.push(Date.now());
      return inner(input, init);
    };
    await crawlSite('https://slow.dk/', 'slow.dk', deps(fetch, 120));
    expect(stamps).toHaveLength(4);
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]! - stamps[i - 1]!).toBeGreaterThanOrEqual(110);
  });
  it('tries the www twin when the bare domain does not answer', async () => {
    const fetch = fakeFetch({ 'https://www.twin.dk/': page('<p>info@twin.dk</p>') }, { offline: ['twin.dk'] });
    const result = await crawlSite('https://twin.dk/', 'twin.dk', deps(fetch));
    expect(result.status).toBe('done');
    expect(result.emails.map((e) => e.address)).toEqual(['info@twin.dk']);
  });

  it('follows a meta refresh to a new domain and treats it as the company site', async () => {
    const fetch = fakeFetch({
      'https://old.dk/': page('<meta http-equiv="refresh" content="0; url=https://new-brand.dk/">'),
      'https://new-brand.dk/': page('<a href="/kontakt">Kontakt</a>'),
      'https://new-brand.dk/kontakt': page('<p>hej@new-brand.dk</p>'),
    });
    const result = await crawlSite('https://old.dk/', 'old.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['hej@new-brand.dk']);
  });

  it('reads likely pages from the sitemap robots.txt declares when the homepage links nowhere', async () => {
    const fetch = fakeFetch({
      'https://map.dk/robots.txt': page('User-agent: *\nAllow: /\nSitemap: https://map.dk/sitemap_index.xml'),
      'https://map.dk/': page('<div id="menu-root"></div><p>Welcome to our shop.</p>'),
      'https://map.dk/sitemap_index.xml': page('<sitemapindex><sitemap><loc>https://map.dk/post-sitemap.xml</loc></sitemap><sitemap><loc>https://map.dk/page-sitemap.xml</loc></sitemap></sitemapindex>'),
      'https://map.dk/page-sitemap.xml': page('<urlset><url><loc>https://map.dk/</loc></url><url><loc>https://map.dk/find-os</loc></url></urlset>'),
      'https://map.dk/find-os': page('<p>butik@map.dk</p>'),
    });
    const result = await crawlSite('https://map.dk/', 'map.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['butik@map.dk']);
    expect(fetch.calls.map((c) => c.url)).not.toContain('https://map.dk/post-sitemap.xml');
  });

  it('tries the usual contact paths when the linked pages only hold an address on another domain', async () => {
    const fetch = fakeFetch({
      'https://studio.dk/': page('<a href="/about">About</a><p>Site by <a href="mailto:hello@webagency.dk">Web Agency</a></p>'),
      'https://studio.dk/about': page('<p>We make chairs.</p>'),
      'https://studio.dk/kontakt': page('<p>stol@studio.dk</p>'),
    });
    const result = await crawlSite('https://studio.dk/', 'studio.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['stol@studio.dk']);
  });

  it('tries the usual contact paths when the linked pages hold no address', async () => {
    const fetch = fakeFetch({
      'https://quiet.dk/': page('<a href="/about">About</a>'),
      'https://quiet.dk/about': page('<p>We make chairs.</p>'),
      'https://quiet.dk/kontakt': page('<p>stol@quiet.dk</p>'),
    });
    const result = await crawlSite('https://quiet.dk/', 'quiet.dk', deps(fetch));
    expect(result.emails.map((e) => e.address)).toEqual(['stol@quiet.dk']);
    expect(result.pages.filter((p) => p.note !== 'robots').length).toBeLessThanOrEqual(8);
  });
});

describe('sharePeopleText', () => {
  const pageOf = (url: string, n: number) => ({ url, title: '', description: '', text: 'x'.repeat(n) });

  it('shares the budget, team pages first and the imprint last', () => {
    const shared = sharePeopleText([pageOf('https://a.dk/om-os', 9_000), pageOf('https://a.dk/impressum', 500), pageOf('https://a.dk/team', 9_000)], 8_000);
    expect(shared.map((p) => [p.url, p.text.length])).toEqual([
      ['https://a.dk/team', 3_750],
      ['https://a.dk/om-os', 3_750],
      ['https://a.dk/impressum', 500],
    ]);
  });

  it('leaves what a short page does not need to the others', () => {
    const shared = sharePeopleText([pageOf('https://a.dk/team', 300), pageOf('https://a.dk/about', 9_000)], 8_000);
    expect(shared.map((p) => p.text.length)).toEqual([300, 7_700]);
  });
});
