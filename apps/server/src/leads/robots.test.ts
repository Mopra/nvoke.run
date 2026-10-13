import { describe, expect, it } from 'vitest';
import { fakeFetch } from '../testing/fakes.js';
import { RobotsCache, parseRobots, robotsUrlFor } from './robots.js';

const ROBOTS = 'https://acme.dk/robots.txt';

describe('parseRobots', () => {
  it('obeys the nvokebot group over the wildcard group', () => {
    const rules = parseRobots(
      ROBOTS,
      ['User-agent: *', 'Disallow: /', '', 'User-agent: nvokebot', 'Disallow: /private', 'Allow: /private/press', 'Crawl-delay: 3'].join('\n'),
    );
    expect(rules.isAllowed('https://acme.dk/')).toBe(true);
    expect(rules.isAllowed('https://acme.dk/kontakt')).toBe(true);
    expect(rules.isAllowed('https://acme.dk/private/x')).toBe(false);
    expect(rules.isAllowed('https://acme.dk/private/press')).toBe(true);
    expect(rules.crawlDelayMs).toBe(3_000);
  });

  it('falls back to the wildcard group', () => {
    const rules = parseRobots(ROBOTS, 'User-agent: *\nDisallow: /admin\nDisallow: /*.pdf$\n');
    expect(rules.isAllowed('https://acme.dk/about')).toBe(true);
    expect(rules.isAllowed('https://acme.dk/admin/login')).toBe(false);
    expect(rules.isAllowed('https://acme.dk/files/price.pdf')).toBe(false);
    expect(rules.crawlDelayMs).toBeUndefined();
  });

  it('blocks everything when told to, and caps a silly crawl delay', () => {
    const rules = parseRobots(ROBOTS, 'User-agent: nvokebot\nDisallow: /\nCrawl-delay: 3600');
    expect(rules.isAllowed('https://acme.dk/')).toBe(false);
    expect(rules.crawlDelayMs).toBe(10_000);
  });

  it('allows everything for an empty file or one about other bots', () => {
    expect(parseRobots(ROBOTS, '').isAllowed('https://acme.dk/x')).toBe(true);
    expect(parseRobots(ROBOTS, 'User-agent: GPTBot\nDisallow: /').isAllowed('https://acme.dk/x')).toBe(true);
  });

  it('builds the robots.txt URL for an origin', () => {
    expect(robotsUrlFor('https://acme.dk:8443/a/b?c')).toBe('https://acme.dk:8443/robots.txt');
  });
});

describe('RobotsCache', () => {
  it('treats 4xx as allow all and 5xx or network errors as disallow all (RFC 9309)', async () => {
    const fetch = fakeFetch(
      {
        'https://four.dk/robots.txt': { status: 404 },
        'https://forbidden.dk/robots.txt': { status: 403 },
        'https://five.dk/robots.txt': { status: 503 },
      },
      { offline: ['down.dk'] },
    );
    const cache = new RobotsCache({ fetch });
    expect((await cache.rulesFor('https://four.dk/x')).isAllowed('https://four.dk/x')).toBe(true);
    expect((await cache.rulesFor('https://forbidden.dk/x')).isAllowed('https://forbidden.dk/x')).toBe(true);
    expect((await cache.rulesFor('https://five.dk/x')).isAllowed('https://five.dk/x')).toBe(false);
    expect((await cache.rulesFor('https://down.dk/x')).isAllowed('https://down.dk/x')).toBe(false);
  });

  it('fetches robots.txt once per origin, identifying as nvokebot', async () => {
    const fetch = fakeFetch({ [ROBOTS]: { body: 'User-agent: *\nDisallow: /secret', headers: { 'content-type': 'text/plain' } } });
    const cache = new RobotsCache({ fetch });
    const [a, b] = await Promise.all([cache.rulesFor('https://acme.dk/'), cache.rulesFor('https://acme.dk/secret')]);
    expect(a.isAllowed('https://acme.dk/secret')).toBe(false);
    expect(b).toBe(a);
    expect(fetch.calls).toHaveLength(1);
    expect(fetch.calls[0]?.headers['user-agent']).toBe('nvokebot/1.0 (+https://nvoke.run/bot)');
  });

  it('applies rules from a redirected robots.txt to the origin that was asked', async () => {
    const fetch = fakeFetch({
      'http://acme.dk/robots.txt': { status: 301, headers: { location: 'https://www.acme.dk/robots.txt' } },
      'https://www.acme.dk/robots.txt': { body: 'User-agent: *\nDisallow: /intern' },
    });
    const rules = await new RobotsCache({ fetch }).rulesFor('http://acme.dk/');
    expect(rules.isAllowed('http://acme.dk/intern/x')).toBe(false);
    expect(rules.isAllowed('http://acme.dk/kontakt')).toBe(true);
  });

  it('expires entries after the TTL', async () => {
    let now = 0;
    const fetch = fakeFetch({ [ROBOTS]: { body: '' } });
    const cache = new RobotsCache({ fetch, ttlMs: 1_000, now: () => now });
    await cache.rulesFor('https://acme.dk/');
    now = 500;
    await cache.rulesFor('https://acme.dk/');
    now = 1_500;
    await cache.rulesFor('https://acme.dk/');
    expect(fetch.calls).toHaveLength(2);
  });
});
