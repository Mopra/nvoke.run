import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pino, type Logger } from 'pino';
import type { FetchLike } from '../leads/http.js';

export const silentLog: Logger = pino({ level: 'silent' });

export interface FakeResponse {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
}

export type FakeRoute = FakeResponse | ((url: URL, init: RequestInit | undefined) => FakeResponse | Promise<FakeResponse>);

export interface FakeFetch extends FetchLike {
  calls: Array<{ url: string; method: string; body?: string; headers: Record<string, string> }>;
}

/**
 * A fetch that serves canned responses keyed by full URL (query included) or
 * by origin plus path. Unknown URLs answer 404, or throw when `offline` lists
 * their host. Redirect statuses carry a Location header and are followed
 * when the caller asked for redirect: 'follow'.
 */
export function fakeFetch(routes: Record<string, FakeRoute>, opts: { offline?: string[] } = {}): FakeFetch {
  const calls: FakeFetch['calls'] = [];
  const impl = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    let url = new URL(String(input));
    for (let hop = 0; hop < 10; hop++) {
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calls.push({
        url: url.toString(),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : init?.body ? String(init.body) : undefined,
        headers,
      });
      if (opts.offline?.includes(url.hostname)) throw new TypeError(`fetch failed: ${url.hostname} unreachable`);
      const route = routes[url.toString()] ?? routes[`${url.origin}${url.pathname}`];
      const res: FakeResponse = route === undefined ? { status: 404, body: 'not found' } : typeof route === 'function' ? await route(url, init) : route;
      const status = res.status ?? 200;
      const location = res.headers?.location;
      if (status >= 300 && status < 400 && location && init?.redirect !== 'manual') {
        url = new URL(location, url);
        continue;
      }
      const response = new Response(status === 204 || status === 304 ? null : (res.body ?? ''), {
        status,
        headers: { 'content-type': 'text/html; charset=utf-8', ...res.headers },
      });
      Object.defineProperty(response, 'url', { value: url.toString() });
      return response;
    }
    throw new TypeError('too many redirects');
  };
  return Object.assign(impl, { calls });
}

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test-fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}
