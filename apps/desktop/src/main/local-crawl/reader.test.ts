import { describe, expect, it } from 'vitest';
import { readSite, type PageLoad, type PageLoader } from './reader';

function loader(pages: Record<string, PageLoad>): PageLoader & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    load: async (url) => {
      calls.push(url);
      return pages[url] ?? { kind: 'error', error: 'not found' };
    },
  };
}

const ok = (url: string, html: string): PageLoad => ({ kind: 'ok', url, html });

describe('readSite', () => {
  it('reads the rendered homepage and its likely pages, keeping the own addresses', async () => {
    const l = loader({
      'https://spa.dk/': ok('https://spa.dk/', '<nav><a href="/kontakt">Kontakt</a><a href="/om-os">Om os</a></nav><p>Bureau: hello@agency.dk</p>'),
      'https://spa.dk/kontakt': ok('https://spa.dk/kontakt', '<a href="mailto:info@spa.dk">Skriv</a>'),
      'https://spa.dk/om-os': { kind: 'robots' },
    });
    const result = await readSite({ website: 'https://spa.dk/', domain: 'spa.dk' }, l);
    expect(result).toEqual({ outcome: 'done', emails: [{ address: 'info@spa.dk', sourceUrl: 'https://spa.dk/kontakt' }], pages: 2 });
  });

  it('stops at a login or a challenge, robots.txt and platform sites', async () => {
    const login = loader({ 'https://portal.dk/': ok('https://portal.dk/', '<form><input type="password"></form>') });
    expect((await readSite({ website: 'https://portal.dk/', domain: 'portal.dk' }, login)).outcome).toBe('blocked');

    const robots = loader({ 'https://no.dk/': { kind: 'robots' } });
    expect(await readSite({ website: 'https://no.dk/', domain: 'no.dk' }, robots)).toEqual({ outcome: 'blocked', emails: [], pages: 0 });

    const platform = loader({});
    expect((await readSite({ website: 'https://www.linkedin.com/company/acme', domain: 'linkedin.com' }, platform)).outcome).toBe('blocked');
    expect(platform.calls).toEqual([]);
  });

  it('falls back to http, fails when nothing loads, and loads at most 8 pages', async () => {
    const plain = loader({ 'http://plain.dk/': ok('http://plain.dk/', '<p>info@plain.dk</p>') });
    expect((await readSite({ website: 'https://plain.dk/', domain: 'plain.dk' }, plain)).emails).toEqual([
      { address: 'info@plain.dk', sourceUrl: 'http://plain.dk/' },
    ]);
    expect((await readSite({ website: 'https://gone.dk/', domain: 'gone.dk' }, loader({}))).outcome).toBe('failed');

    const links = Array.from({ length: 20 }, (_, i) => `<a href="/kontakt-${i}">Kontakt</a>`).join('');
    const pages: Record<string, PageLoad> = { 'https://big.dk/': ok('https://big.dk/', links) };
    for (let i = 0; i < 20; i++) pages[`https://big.dk/kontakt-${i}`] = ok(`https://big.dk/kontakt-${i}`, `<p>p${i}@big.dk</p>`);
    const big = loader(pages);
    const result = await readSite({ website: 'https://big.dk/', domain: 'big.dk' }, big);
    expect(big.calls).toHaveLength(8);
    expect(result.pages).toBe(8);
  });
});
