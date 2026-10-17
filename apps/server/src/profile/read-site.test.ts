import { describe, expect, it } from 'vitest';
import type { CrawlDeps } from '../leads/crawl.js';
import type { FetchLike } from '../leads/http.js';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { fakeFetch } from '../testing/fakes.js';
import { pageText, pickProfilePages, readSite } from './read-site.js';

function deps(fetch: FetchLike): CrawlDeps {
  const limiter = new RateLimiter(1);
  return { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
}

const filler = 'We fit dental clinics with chairs, lamps and the software that books patients. '.repeat(5);

describe('pickProfilePages', () => {
  it('picks pricing, services and about first, one page of each kind, same site only', () => {
    const html = `
      <a href="/blog/2020/news">News</a>
      <a href="/pricing">Pricing</a>
      <a href="/pricing/enterprise">Enterprise</a>
      <a href="/om-os">Om os</a>
      <a href="/ydelser">Ydelser</a>
      <a href="https://other.com/about">Their about</a>
      <a href="/kontakt">Kontakt</a>
      <a href="mailto:hi@acme.dk">Mail</a>`;
    expect(pickProfilePages(html, 'https://acme.dk/', 4)).toEqual([
      'https://acme.dk/pricing',
      'https://acme.dk/ydelser',
      'https://acme.dk/om-os',
    ]);
  });
});

describe('pageText', () => {
  it('keeps title, description and visible text, without scripts, nav or repeats', () => {
    const page = pageText(
      `<html><head><title> Acme  Dental </title><meta name="description" content="Chairs for clinics"></head>
       <body><nav>Home Pricing</nav><h1>Chairs</h1><p>For clinics.</p><p>For clinics.</p><script>var x = 1</script></body></html>`,
      'https://acme.dk/',
    );
    expect(page).toEqual({ url: 'https://acme.dk/', title: 'Acme Dental', description: 'Chairs for clinics', text: 'Chairs\nFor clinics.' });
  });
});

describe('readSite', () => {
  it('reads the homepage and the profile pages', async () => {
    const fetch = fakeFetch({
      'https://acme.dk/robots.txt': { status: 404 },
      'https://acme.dk/': { body: `<title>Acme</title><body><p>${filler}</p><a href="/priser">Priser</a><a href="/om-os">Om os</a></body>` },
      'https://acme.dk/priser': { body: '<body><p>From 499 kr a month.</p></body>' },
      'https://acme.dk/om-os': { body: '<body><p>Founded 2009 in Aarhus.</p></body>' },
    });
    const result = await readSite('https://acme.dk/', deps(fetch));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.domain).toBe('acme.dk');
    expect(result.pages.map((p) => p.url)).toEqual(['https://acme.dk/', 'https://acme.dk/priser', 'https://acme.dk/om-os']);
    expect(result.pages[1]!.text).toBe('From 499 kr a month.');
  });

  it('says why a site cannot be read', async () => {
    const blocked = fakeFetch({ 'https://private.dk/robots.txt': { body: 'User-agent: *\nDisallow: /', headers: { 'content-type': 'text/plain' } } });
    expect(await readSite('https://private.dk/', deps(blocked))).toEqual({ ok: false, reason: 'blocked' });

    const refused = fakeFetch({ 'https://wall.dk/robots.txt': { status: 404 }, 'https://wall.dk/': { status: 403 } });
    expect(await readSite('https://wall.dk/', deps(refused))).toEqual({ ok: false, reason: 'refused' });

    const shell = fakeFetch({
      'https://spa.dk/robots.txt': { status: 404 },
      'https://spa.dk/': { body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' },
    });
    expect(await readSite('https://spa.dk/', deps(shell))).toEqual({ ok: false, reason: 'js_only' });

    const down = fakeFetch({}, { offline: ['down.dk'] });
    expect(await readSite('https://down.dk/', deps(down))).toEqual({ ok: false, reason: 'unreachable' });
  });
});
