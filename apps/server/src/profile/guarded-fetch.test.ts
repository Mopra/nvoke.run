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
    if (req.url === '/odd') {
      // A server answering with a status Response() refuses, written raw.
      req.socket.end(['HTTP/1.1 999 Odd', 'content-length: 0', '', ''].join('\r\n'));
      return;
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

  it('rejects a status outside 200 to 599 instead of crashing the process', async () => {
    const fetch = guardedFetch({ allowPrivate: true });
    await expect(fetch(`http://127.0.0.1:${port}/odd`)).rejects.toThrow('unusable HTTP status 999');
  });
});
