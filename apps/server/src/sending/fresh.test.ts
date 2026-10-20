import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../leads/limits.js';
import { RobotsCache } from '../leads/robots.js';
import { fakeFetch } from '../testing/fakes.js';
import { isPostUrl, latestPost, pickPostLinks } from './fresh.js';

const POST_TEXT = 'We shipped text reminders for every clinic on the Pro plan this week. '.repeat(6);

function deps(routes: Parameters<typeof fakeFetch>[0]) {
  const fetch = fakeFetch(routes);
  const limiter = new RateLimiter(1);
  return { fetch, limiter, robots: new RobotsCache({ fetch, limiter }) };
}

describe('pickPostLinks', () => {
  it('finds posts and post sections on the same site, in page order, without lists of tags or pages', () => {
    const html = `
      <a href="/pricing">Pricing</a>
      <a href="/blog">Blog</a>
      <a href="/blog/text-reminders-for-clinics">Text reminders</a>
      <a href="/blog/tag/product">Product</a>
      <a href="/blog/page/2">Older</a>
      <a href="https://acme.io/news/2026/10/new-office">New office</a>
      <a href="https://other.com/blog/elsewhere">Elsewhere</a>
      <a href="/case-studies/">Cases</a>
      <a href="/blog/cover.png">Image</a>`;
    expect(pickPostLinks(html, 'https://acme.io/')).toEqual({
      posts: ['https://acme.io/blog/text-reminders-for-clinics', 'https://acme.io/news/2026/10/new-office'],
      sections: ['https://acme.io/blog', 'https://acme.io/case-studies/'],
    });
    expect(isPostUrl('https://acme.io/changelog/v2-api')).toBe(true);
    expect(isPostUrl('https://acme.io/contact')).toBe(false);
  });
});

describe('latestPost', () => {
  it('reads the first post the homepage links to', async () => {
    const page = await latestPost(
      'https://acme.io/',
      deps({
        'https://acme.io/': { body: '<a href="/blog/text-reminders">Text reminders</a>' },
        'https://acme.io/blog/text-reminders': { body: `<title>Text reminders</title><article><p>${POST_TEXT}</p></article>` },
      }),
    );
    expect(page).toMatchObject({ url: 'https://acme.io/blog/text-reminders', title: 'Text reminders' });
    expect(page!.text).toContain('We shipped text reminders');
    expect(page!.text.length).toBeLessThanOrEqual(2_500);
  });

  it('goes through a section page to its newest post', async () => {
    const page = await latestPost(
      'https://acme.io/',
      deps({
        'https://acme.io/': { body: '<a href="/news">News</a>' },
        'https://acme.io/news': { body: '<a href="/news/new-office-in-leeds">New office in Leeds</a><a href="/news/older-one">Older</a>' },
        'https://acme.io/news/new-office-in-leeds': { body: `<p>${POST_TEXT}</p>` },
      }),
    );
    expect(page?.url).toBe('https://acme.io/news/new-office-in-leeds');
  });

  it('gives null, never an error, when there is no post, robots.txt says no, or the site is down', async () => {
    expect(await latestPost('https://acme.io/', deps({ 'https://acme.io/': { body: '<a href="/about">About</a>' } }))).toBeNull();
    expect(
      await latestPost(
        'https://acme.io/',
        deps({
          'https://acme.io/robots.txt': { body: 'User-agent: *\nDisallow: /blog', headers: { 'content-type': 'text/plain' } },
          'https://acme.io/': { body: '<a href="/blog/post-one">One</a>' },
          'https://acme.io/blog/post-one': { body: `<p>${POST_TEXT}</p>` },
        }),
      ),
    ).toBeNull();
    expect(await latestPost('https://down.io/', deps({ 'https://down.io/': () => Promise.reject(new TypeError('fetch failed')) }))).toBeNull();
  });
});
