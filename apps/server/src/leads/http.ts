// Low level HTTP for the lead pipeline. Everything we fetch is somebody
// else's server: untrusted, sometimes slow, occasionally enormous. These
// helpers cap time and bytes and never buffer more than asked for.

/** How the crawler identifies itself, on every request. */
export const BOT_USER_AGENT = 'nvokebot/1.0 (+https://nvoke.run/bot)';

/** The token robots.txt groups are matched against. */
export const BOT_TOKEN = 'nvokebot';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface CappedResponse {
  status: number;
  ok: boolean;
  /** Final URL. Equal to the requested one when redirects are not followed. */
  url: string;
  headers: Headers;
  body: Buffer;
  /** True when the body was cut at maxBytes. */
  truncated: boolean;
}

export interface CappedOptions {
  fetch?: FetchLike;
  maxBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: string;
  body?: string | URLSearchParams;
  redirect?: RequestInit['redirect'];
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 2_000_000;

/** One HTTP request with a byte cap and a timeout. Throws on network errors. */
export async function fetchCapped(url: string, opts: CappedOptions = {}): Promise<CappedResponse> {
  const doFetch = opts.fetch ?? fetch;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

  const res = await doFetch(url, {
    method: opts.method ?? 'GET',
    body: opts.body,
    redirect: opts.redirect ?? 'follow',
    signal,
    headers: { 'user-agent': BOT_USER_AGENT, ...opts.headers },
  });

  const { body, truncated } = await readCapped(res, maxBytes);
  return { status: res.status, ok: res.ok, url: res.url || url, headers: res.headers, body, truncated };
}

async function readCapped(res: Response, maxBytes: number): Promise<{ body: Buffer; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { body: Buffer.alloc(0), truncated: false };
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    const room = maxBytes - total;
    if (value.byteLength >= room) {
      chunks.push(Buffer.from(value.subarray(0, room)));
      total += room;
      truncated = value.byteLength > room;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(Buffer.from(value));
    total += value.byteLength;
  }
  return { body: Buffer.concat(chunks, total), truncated };
}

/** GET and parse JSON. Throws with the status on a non 2xx answer. */
export async function fetchJson<T>(url: string, opts: CappedOptions = {}): Promise<T> {
  const res = await fetchCapped(url, {
    ...opts,
    headers: { accept: 'application/json', ...opts.headers },
  });
  const text = res.body.toString('utf8');
  if (!res.ok) throw new HttpError(res.status, `${opts.method ?? 'GET'} ${redact(url)} failed with ${res.status}`, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(res.status, `${redact(url)} returned invalid JSON`, text.slice(0, 200));
  }
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly bodySnippet?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function redact(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

/** The charset from a Content-Type header or an HTML meta tag, defaulting to UTF-8. */
export function detectCharset(contentType: string | null, head: Buffer): string {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const sniff = head.subarray(0, 2048).toString('latin1');
  const fromMeta = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(sniff)?.[1];
  return (fromMeta ?? 'utf-8').toLowerCase();
}

/** Decodes a body with its declared charset, falling back to UTF-8 for labels Node does not know. */
export function decodeBody(body: Buffer, contentType: string | null): string {
  const charset = detectCharset(contentType, body);
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
