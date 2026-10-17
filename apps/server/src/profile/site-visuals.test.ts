import { describe, expect, it } from 'vitest';
import { firstImage, visualCandidates } from './site-visuals.js';

describe('visualCandidates', () => {
  it('ranks apple-touch-icon, then svg, then the largest icon, then /favicon.ico', () => {
    const html = `<head>
      <link rel="icon" href="/favicon-16.png" sizes="16x16">
      <link rel="icon" href="/favicon-32.png" sizes="32x32">
      <link rel="icon" type="image/svg+xml" href="/logo.svg">
      <link rel="apple-touch-icon" href="https://cdn.acme.dk/touch.png">
      <meta property="og:image" content="/share.png">
      <meta name="twitter:image" content="http://acme.dk/insecure.png">
    </head>`;
    expect(visualCandidates(html, 'https://acme.dk/')).toEqual({
      icons: ['https://cdn.acme.dk/touch.png', 'https://acme.dk/logo.svg', 'https://acme.dk/favicon-32.png', 'https://acme.dk/favicon-16.png'],
      images: ['https://acme.dk/share.png'],
    });
  });

  it('falls back to /favicon.ico and drops http images', () => {
    expect(visualCandidates('<head><meta property="og:image" content="http://acme.dk/a.png"></head>', 'https://acme.dk/about')).toEqual({
      icons: ['https://acme.dk/favicon.ico'],
      images: [],
    });
  });
});

describe('firstImage', () => {
  it('skips what does not load as an image', async () => {
    const fetch = async (url: string | URL) => {
      const u = String(url);
      if (u.endsWith('/a.png')) return new Response('', { status: 404 });
      if (u.endsWith('/b.png')) return new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response('x', { status: 200, headers: { 'content-type': 'image/png' } });
    };
    expect(await firstImage(fetch, ['https://acme.dk/a.png', 'https://acme.dk/b.png', 'https://acme.dk/c.png'])).toBe('https://acme.dk/c.png');
    expect(await firstImage(fetch, ['https://acme.dk/a.png'])).toBeNull();
  });
});
