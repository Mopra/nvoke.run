import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../testing/fakes.js';
import { RateLimiter } from './limits.js';
import { extractListCandidates, isListPage, isSkippedHost, listPageDeps, mineListPage, nameText, unwrapLink } from './listicle.js';
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
  });

  it('stays out where robots.txt says so', async () => {
    const limiter = new RateLimiter(0);
    const fetch = fakeFetch({
      'https://dir.example/robots.txt': { body: 'User-agent: *\nDisallow: /' },
      'https://dir.example/list': { body: PAGE },
    });
    const res = await mineListPage('https://dir.example/list', { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) });
    expect(res).toEqual({ status: 'skipped', reason: 'robots' });
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
      expect(await mineListPage(url, deps)).toEqual({ status: 'skipped', reason: 'error' });
    }
  });
});
