// A fetch for URLs a user typed. Every connection, redirects and robots.txt
// included, goes through the webhook address guard on the socket itself
// (guardedLookup), so the address that was checked is the one connected to
// and a DNS answer cannot change in between. IP literals skip DNS, so they
// are checked here.

import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import type { FetchLike } from '../leads/http.js';
import { guardedLookup, isPublicAddress, type Resolve, type UrlPolicy } from '../webhooks/address.js';

const MAX_REDIRECTS = 5;

export function guardedFetch(policy: UrlPolicy, resolve?: Resolve): FetchLike {
  const lookup = guardedLookup(policy, resolve);

  const once = (url: URL, init: RequestInit | undefined): Promise<Response> => {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return Promise.reject(new TypeError('not http'));
    if (!policy.allowPrivate && isIP(host) && !isPublicAddress(host)) return Promise.reject(new TypeError('private address'));
    const client = url.protocol === 'https:' ? https : http;
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    return new Promise((resolvePromise, reject) => {
      const req = client.request(url, { method: init?.method ?? 'GET', headers, lookup, signal: init?.signal ?? undefined }, (res) => {
        const outHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) for (const item of v) outHeaders.append(k, item);
          else if (v !== undefined) outHeaders.set(k, v);
        }
        const status = res.statusCode ?? 0;
        const empty = status === 204 || status === 304 || (init?.method ?? 'GET') === 'HEAD';
        const body = empty ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
        if (empty) res.resume();
        const response = new Response(body, { status, headers: outHeaders });
        Object.defineProperty(response, 'url', { value: url.toString() });
        resolvePromise(response);
      });
      req.on('error', reject);
      if (typeof init?.body === 'string') req.write(init.body);
      req.end();
    });
  };

  return async (input, init) => {
    let url = new URL(String(input));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await once(url, init);
      const location = res.headers.get('location');
      if (init?.redirect === 'manual' || res.status < 300 || res.status >= 400 || !location) return res;
      await res.body?.cancel().catch(() => undefined);
      url = new URL(location, url);
    }
    throw new TypeError('too many redirects');
  };
}
