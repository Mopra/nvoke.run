import { describe, expect, it } from 'vitest';
import { LocalCrawler, mayWork, type WorkConditions } from './index';
import type { PageLoad } from './reader';
import { RobotsCache } from './robots';

const away: WorkConditions = { enabled: true, signedIn: true, onBattery: false, idleState: 'idle' };

describe('mayWork', () => {
  it('works only opted in, signed in, on power and while the computer is idle or locked', () => {
    expect(mayWork(away)).toBe(true);
    expect(mayWork({ ...away, idleState: 'locked' })).toBe(true);
    expect(mayWork({ ...away, idleState: 'active' })).toBe(false);
    expect(mayWork({ ...away, enabled: false })).toBe(false);
    expect(mayWork({ ...away, signedIn: false })).toBe(false);
    expect(mayWork({ ...away, onBattery: true })).toBe(false);
  });
});

describe('LocalCrawler', () => {
  it('claims one company at a time, reads it, sends the result and wipes the browser', async () => {
    const task = {
      companyId: '11111111-1111-4111-8111-111111111111',
      searchId: '22222222-2222-4222-8222-222222222222',
      domain: 'spa.dk',
      website: 'https://spa.dk/',
      reason: 'js_only',
    };
    const sent: Array<{ path: string; body: unknown }> = [];
    let claims = 0;
    let resets = 0;
    const crawler = new LocalCrawler({
      api: async (path, init) => {
        sent.push({ path, body: JSON.parse(String(init?.body)) });
        if (path === '/v1/local-crawl/claim') return Response.json({ tasks: claims++ === 0 ? [task] : [] });
        return Response.json({ stored: 1 });
      },
      conditions: () => away,
      browser: () => ({
        load: async (url): Promise<PageLoad> => ({ kind: 'ok', url, html: '<p>info@spa.dk</p>' }),
        reset: async () => {
          resets++;
        },
      }),
    });
    expect(await crawler.tick()).toBe(1);
    expect(sent.map((s) => s.path)).toEqual(['/v1/local-crawl/claim', '/v1/local-crawl/results', '/v1/local-crawl/claim']);
    expect(sent[0]!.body).toEqual({ max: 1 });
    expect(sent[1]!.body).toMatchObject({ companyId: task.companyId, outcome: 'done', emails: [{ address: 'info@spa.dk' }] });
    expect(resets).toBe(1);
  });

  it('does nothing while the user is at the computer', async () => {
    let called = false;
    const crawler = new LocalCrawler({
      api: async () => {
        called = true;
        return Response.json({ tasks: [] });
      },
      conditions: () => ({ ...away, idleState: 'active' }),
      browser: () => ({ load: async (): Promise<PageLoad> => ({ kind: 'robots' }), reset: async () => undefined }),
    });
    expect(await crawler.tick()).toBe(0);
    expect(called).toBe(false);
  });
});

describe('RobotsCache', () => {
  it('obeys nvokebot rules, allows on 4xx and disallows when unreachable', async () => {
    const rules = new RobotsCache(async (url) => {
      if (url.startsWith('https://a.dk')) return new Response('User-agent: nvokebot\nDisallow: /private');
      if (url.startsWith('https://b.dk')) return new Response('', { status: 404 });
      throw new Error('down');
    });
    expect((await rules.rulesFor('https://a.dk/')).isAllowed('https://a.dk/kontakt')).toBe(true);
    expect((await rules.rulesFor('https://a.dk/')).isAllowed('https://a.dk/private/x')).toBe(false);
    expect((await rules.rulesFor('https://b.dk/x')).isAllowed('https://b.dk/x')).toBe(true);
    expect((await rules.rulesFor('https://c.dk/')).isAllowed('https://c.dk/')).toBe(false);
  });

  it('never follows a redirect to a private host', async () => {
    const rules = new RobotsCache(
      async () => new Response(null, { status: 301, headers: { location: 'http://192.168.1.1/robots.txt' } }),
      undefined,
      undefined,
      async (host) => !host.startsWith('192.168.'),
    );
    expect((await rules.rulesFor('https://evil.dk/')).isAllowed('https://evil.dk/')).toBe(false);
  });
});
