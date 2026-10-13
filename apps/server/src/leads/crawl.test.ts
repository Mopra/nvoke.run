import { describe, expect, it } from 'vitest';
import { fakeFetch, fixture, type FakeRoute } from '../testing/fakes.js';
import { crawlSite, pickLikelyPages, type CrawlDeps } from './crawl.js';
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
});
