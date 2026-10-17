import { describe, expect, it } from 'vitest';
import { clientRedirect, homepageVariants, parseSitemap, rankSitemaps } from './site.ts';

describe('homepageVariants', () => {
  it('tries plain http, then the www twin', () => {
    expect(homepageVariants('https://acme.dk/')).toEqual([
      'https://acme.dk/',
      'http://acme.dk/',
      'https://www.acme.dk/',
      'http://www.acme.dk/',
    ]);
  });

  it('drops www when the source gave it', () => {
    expect(homepageVariants('https://www.acme.dk/da')).toContain('https://acme.dk/da');
  });

  it('starts with http when that is what was given', () => {
    expect(homepageVariants('http://acme.dk/')[0]).toBe('http://acme.dk/');
    expect(homepageVariants('http://acme.dk/')).toHaveLength(3);
  });
});

describe('clientRedirect', () => {
  it('reads a meta refresh', () => {
    const html = '<html><head><meta http-equiv="refresh" content="0; url=https://new-acme.dk/"></head></html>';
    expect(clientRedirect(html, 'https://acme.dk/')).toBe('https://new-acme.dk/');
  });

  it('reads a relative meta refresh', () => {
    const html = "<meta http-equiv='Refresh' content='0;URL=/da/'>";
    expect(clientRedirect(html, 'https://acme.dk/')).toBe('https://acme.dk/da/');
  });

  it('reads a script redirect on an empty page', () => {
    const html = '<html><body><script>window.location.href = "https://acme.de/home";</script></body></html>';
    expect(clientRedirect(html, 'https://acme.dk/')).toBe('https://acme.de/home');
  });

  it('ignores a script redirect on a page with content', () => {
    const text = 'Real content about the company. '.repeat(20);
    const html = `<html><body><p>${text}</p><script>if (x) location.href = "/other";</script></body></html>`;
    expect(clientRedirect(html, 'https://acme.dk/')).toBeNull();
  });

  it('ignores a refresh in noscript, an onclick and a platform target', () => {
    expect(clientRedirect('<noscript><meta http-equiv="refresh" content="0;url=/nojs"></noscript><p>x</p>', 'https://acme.dk/')).toBeNull();
    expect(clientRedirect(`<button onclick="window.location.href='/booking'">Book</button>`, 'https://acme.dk/')).toBeNull();
    expect(clientRedirect('<meta http-equiv="refresh" content="0;url=https://www.booking.com/hotel/acme">', 'https://acme.dk/')).toBeNull();
  });

  it('ignores non-http targets and pages without a redirect', () => {
    expect(clientRedirect('<meta http-equiv="refresh" content="0;url=javascript:alert(1)">', 'https://acme.dk/')).toBeNull();
    expect(clientRedirect('<p>hi</p>', 'https://acme.dk/')).toBeNull();
  });
});

describe('parseSitemap', () => {
  it('splits pages from child sitemaps and keeps the site only', () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://acme.dk/kontakt</loc></url>
      <url><loc><![CDATA[https://www.acme.dk/om-os]]></loc></url>
      <url><loc>https://other.dk/contact</loc></url>
      <url><loc>https://acme.dk/extra-sitemap.xml</loc></url>
    </urlset>`;
    expect(parseSitemap(xml, 'https://acme.dk/')).toEqual({
      pages: ['https://acme.dk/kontakt', 'https://www.acme.dk/om-os'],
      sitemaps: ['https://acme.dk/extra-sitemap.xml'],
    });
  });

  it('treats every entry of an index as a sitemap', () => {
    const xml = '<sitemapindex><sitemap><loc>https://acme.dk/sitemap?page=1</loc></sitemap></sitemapindex>';
    expect(parseSitemap(xml, 'https://acme.dk/').sitemaps).toEqual(['https://acme.dk/sitemap?page=1']);
  });

  it('ranks page sitemaps before post and product ones', () => {
    expect(rankSitemaps(['https://a.dk/post-sitemap.xml', 'https://a.dk/x.xml', 'https://a.dk/page-sitemap.xml'])).toEqual([
      'https://a.dk/page-sitemap.xml',
      'https://a.dk/x.xml',
      'https://a.dk/post-sitemap.xml',
    ]);
  });
});
