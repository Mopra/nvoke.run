import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../testing/fakes.js';
import { RateLimiter } from './limits.js';
import { LIST_PAGE_MAX_BYTES, extractListCandidates, isListPage, isSkippedHost, listPageDeps, mineListPage, nameText, nextPageLink, unwrapLink } from './listicle.js';
import { RobotsCache } from './robots.js';

describe('isListPage', () => {
  it('knows list titles and directory category pages', () => {
    expect(isListPage('https://blog.acme.com/x', 'Top 25 B2B Lead Generation Agencies in London (2026)')).toBe(true);
    expect(isListPage('https://acme.com/x', 'The 10 best cold email agencies')).toBe(true);
    expect(isListPage('https://acme.com/x', '15 Lead Generation Companies to Know')).toBe(true);
    expect(isListPage('https://clutch.co/call-centers/lead-generation', 'Lead Generation Companies')).toBe(true);
    expect(isListPage('https://clutch.co/profile/acme', 'Acme')).toBe(false);
    expect(isListPage('https://acme.com/', 'Acme | B2B lead generation agency')).toBe(false);
  });

  it('knows city lists and alternatives pages', () => {
    expect(isListPage('https://acme.com/x', 'B2B SaaS startups in Berlin')).toBe(true);
    expect(isListPage('https://acme.com/x', 'Lead generation companies in London (2026)')).toBe(true);
    expect(isListPage('https://acme.com/x', '12 Belkins alternatives for B2B lead generation')).toBe(true);
    expect(isListPage('https://acme.com/x', 'The best alternatives to Belkins')).toBe(true);
    expect(isListPage('https://acme.com/', 'Acme, a lead generation agency in London')).toBe(false);
    expect(isListPage('https://www.lemlist.com/partners', 'lemlist Partners')).toBe(true);
    expect(isListPage('https://tool.io/alternatives/belkins', 'Belkins vs Tool')).toBe(true);
    expect(isListPage('https://acme.com/partners/acme-corp/case-study', 'Acme Corp')).toBe(false);
  });
});

describe('nextPageLink', () => {
  const wrap = (links: string) => `<html><body><main>${links}</main></body></html>`;
  it('finds a plain next page that only counts the page up', () => {
    expect(nextPageLink(wrap('<a href="?page=2">Next</a>'), 'https://dir.example/list')).toBe('https://dir.example/list?page=2');
    expect(nextPageLink(wrap('<a href="/list?sort=top&page=3">3</a>'), 'https://dir.example/list?sort=top&page=2')).toBe('https://dir.example/list?sort=top&page=3');
    expect(nextPageLink(wrap('<a href="/blog/top-agencies/page/2/">»</a>'), 'https://dir.example/blog/top-agencies/')).toBe('https://dir.example/blog/top-agencies/page/2/');
    expect(nextPageLink('<link rel="next" href="https://www.dir.example/list?p=2">', 'https://dir.example/list')).toBe('https://www.dir.example/list?p=2');
  });

  it('ignores other lists, other sites, skipped pages and script pagination', () => {
    expect(nextPageLink(wrap('<a href="/other?page=2">Next</a>'), 'https://dir.example/list')).toBeNull();
    expect(nextPageLink(wrap('<a href="https://elsewhere.com/list?page=2">Next</a>'), 'https://dir.example/list')).toBeNull();
    expect(nextPageLink(wrap('<a href="?page=5">Next</a>'), 'https://dir.example/list')).toBeNull();
    expect(nextPageLink(wrap('<a href="?page=2&amp;city=paris">Next</a>'), 'https://dir.example/list')).toBeNull();
    expect(nextPageLink(wrap('<button>Load more</button>'), 'https://dir.example/list')).toBeNull();
  });
});

describe('nameText', () => {
  it('keeps names and drops numbers, prompts and phrases', () => {
    expect(nameText('3. Punch!')).toBe('Punch!');
    expect(nameText('Visit FRONTLINE Selling →')).toBe('FRONTLINE Selling');
    expect(nameText('Visit website')).toBeNull();
    expect(nameText('call recordings')).toBeNull();
    expect(nameText('This is a long sentence that is not a company name')).toBeNull();
  });
});

describe('unwrapLink', () => {
  it('unwraps a directory redirect', () => {
    expect(unwrapLink('/r?u=https%3A%2F%2Facme.com%2F', 'https://dir.example/list')?.toString()).toBe('https://acme.com/');
    expect(unwrapLink('mailto:x@y.z', 'https://dir.example/')).toBeNull();
  });
});

const PAGE = `<html><head><title>Top 5 lead generation agencies</title></head><body>
<nav><a href="https://navpartner.com">Partner</a></nav>
<main>
  <h1>Top 5 lead generation agencies</h1>
  <ol>
    <li><h3>1. Acme Leads</h3><p>Acme books meetings for SaaS.</p><a href="https://www.acmeleads.com/?utm=x">Visit website</a></li>
    <li><a href="https://beta.io">Beta Outbound</a> runs cold email for agencies.</li>
    <li><a href="https://linkedin.com/company/beta">LinkedIn</a></li>
    <li><a href="https://clutch.co/profile/gamma">Gamma on Clutch</a></li>
    <li><a href="https://blog.example.com/other-post">Our other post</a></li>
    <li><a href="https://citation.org/research/2024/report">a study</a></li>
    <li><a href="https://beta.io/pricing">Beta pricing</a></li>
  </ol>
</main>
<footer><a href="https://footer-sponsor.com">Sponsor</a></footer>
</body></html>`;

describe('extractListCandidates', () => {
  it('lists the companies a page links to, once each, without its own site, platforms or chrome', () => {
    const found = extractListCandidates(PAGE, 'https://blog.example.com/top-5');
    expect(found.map((c) => [c.name, c.website])).toEqual([
      ['Acme Leads', 'https://www.acmeleads.com'],
      ['Beta Outbound', 'https://beta.io'],
    ]);
    expect(found[1]!.context).toContain('runs cold email');
  });
});

describe('mineListPage', () => {
  it('reads a page under robots.txt and the rate limit', async () => {
    const limiter = new RateLimiter(0);
    const fetch = fakeFetch({
      'https://blog.example.com/robots.txt': { status: 404, body: '' },
      'https://blog.example.com/top-5': { body: PAGE, headers: { 'content-type': 'text/html' } },
    });
    const res = await mineListPage('https://blog.example.com/top-5', { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) });
    expect(res.status).toBe('ok');
    if (res.status === 'ok') {
      expect(res.title).toBe('Top 5 lead generation agencies');
      expect(res.candidates).toHaveLength(2);
    }
    expect(res.bytes).toBe(Buffer.byteLength(PAGE));
  });

  it('stops reading a page at the byte cap and says what it read', async () => {
    const limiter = new RateLimiter(0);
    const big = PAGE.replace('</main>', `<p>${'x'.repeat(LIST_PAGE_MAX_BYTES)}</p></main>`);
    const fetch = fakeFetch({
      'https://blog.example.com/robots.txt': { status: 404, body: '' },
      'https://blog.example.com/top-5': { body: big },
    });
    const res = await mineListPage('https://blog.example.com/top-5', { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) });
    expect(res.status).toBe('ok');
    expect(res.bytes).toBeLessThanOrEqual(LIST_PAGE_MAX_BYTES);
    if (res.status === 'ok') expect(res.candidates).toHaveLength(2);
  });

  it('stays out where robots.txt says so', async () => {
    const limiter = new RateLimiter(0);
    const fetch = fakeFetch({
      'https://dir.example/robots.txt': { body: 'User-agent: *\nDisallow: /' },
      'https://dir.example/list': { body: PAGE },
    });
    const res = await mineListPage('https://dir.example/list', { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) });
    expect(res).toMatchObject({ status: 'skipped', reason: 'robots' });
  });
});

describe('isSkippedHost', () => {
  it('matches trackers, shorteners and affiliate hosts by domain, not by word', () => {
    for (const host of ['bit.ly', 'www.shareasale.com', 'acme.pxf.io', 'click.linksynergy.com', 'geni.us', 'amzn.to', 'linktr.ee', 'tinyurl.com']) {
      expect(isSkippedHost(host)).toBe(true);
    }
    expect(isSkippedHost('bitly-agency.com')).toBe(false);
    expect(isSkippedHost('myhubspotpartner.com')).toBe(false);
  });
});

describe('listPageDeps', () => {
  it('refuses private, loopback, link-local and metadata addresses by default', async () => {
    const deps = listPageDeps(new RateLimiter(0));
    for (const url of ['http://127.0.0.1/list', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/list', 'http://[::1]/list']) {
      expect(await mineListPage(url, deps)).toMatchObject({ status: 'skipped', reason: 'error' });
    }
  });
});
