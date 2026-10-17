import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { guardedFetch } from './guarded-fetch.js';

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/hop') {
      res.writeHead(302, { location: `http://127.0.0.1:${port}/page` });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<p>${req.url}</p>`);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('guardedFetch', () => {
  it('refuses private IP literals and names that resolve to private addresses', async () => {
    const fetch = guardedFetch({ allowPrivate: false }, async () => [{ address: '127.0.0.1', family: 4 }]);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    await expect(fetch(`http://evil.test:${port}/`)).rejects.toThrow();
  });

  it('checks the address a name resolves to on the socket', async () => {
    // The name resolves to a private address, so the connection is refused before it opens.
    let calls = 0;
    const fetch = guardedFetch({ allowPrivate: false }, async () => {
      calls++;
      return [{ address: '127.0.0.1', family: 4 }];
    });
    await expect(fetch(`http://pub.test:${port}/hop`)).rejects.toThrow();
    expect(calls).toBeGreaterThan(0);
  });

  it('follows redirects or hands them back, and keeps the final URL', async () => {
    const fetch = guardedFetch({ allowPrivate: true });
    const followed = await fetch(`http://127.0.0.1:${port}/hop`);
    expect(followed.url).toBe(`http://127.0.0.1:${port}/page`);
    expect(await followed.text()).toBe('<p>/page</p>');
    const manual = await fetch(`http://127.0.0.1:${port}/hop`, { redirect: 'manual' });
    expect(manual.status).toBe(302);
    expect(manual.headers.get('location')).toBe(`http://127.0.0.1:${port}/page`);
  });
});
