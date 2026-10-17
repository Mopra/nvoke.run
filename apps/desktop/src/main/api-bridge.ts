import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { BridgeResponse, ExportResult, HttpMethod } from '../ipc/contract';

/** The part of AuthSession the bridge needs: an authenticated fetch against apps/server. */
export interface ApiClient {
  api(path: string, init?: RequestInit): Promise<Response>;
}

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PATCH', 'DELETE'];
const MAX_PATH = 2048;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * True for a relative API path under `/v1/` with an optional query string.
 * Refuses absolute URLs, protocol relative paths, backslashes, dot segments
 * and anything that would normalize to a different path, so the renderer can
 * only reach the versioned API on the configured server.
 */
export function isAllowedApiPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH) return false;
  if (!path.startsWith('/v1/') || path.includes('\\') || path.includes('#')) return false;
  // Control characters and spaces never belong in a path we build ourselves.
  if (hasControlOrSpace(path)) return false;
  const pathname = path.split('?', 1)[0]!;
  if (pathname.split('/').some((seg) => seg === '.' || seg === '..' || /^%2e/i.test(seg) || /%2f|%5c/i.test(seg))) {
    return false;
  }
  try {
    const url = new URL(path, 'http://nvoke.invalid');
    return url.origin === 'http://nvoke.invalid' && url.pathname === pathname;
  } catch {
    return false;
  }
}

function hasControlOrSpace(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

function errorOf(body: unknown, status: number): string {
  if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
    return (body as { error: string }).error;
  }
  return `http_${status}`;
}

/** The server's `detail`, only when it is a short code like `blocked`, so free text never reaches the renderer as a code. */
function detailOf(body: unknown): string | undefined {
  const detail = body && typeof body === 'object' ? (body as { detail?: unknown }).detail : undefined;
  return typeof detail === 'string' && /^[a-z][a-z_]{0,39}$/.test(detail) ? detail : undefined;
}

/**
 * Runs one renderer request through the session. Always resolves: invalid
 * input and network failures come back as `ok: false` with status 0.
 */
export async function bridgeRequest(client: ApiClient, method: unknown, path: unknown, body?: unknown): Promise<BridgeResponse> {
  if (typeof method !== 'string' || !METHODS.includes(method as HttpMethod)) {
    return { ok: false, status: 0, error: 'invalid_method' };
  }
  if (!isAllowedApiPath(path)) return { ok: false, status: 0, error: 'invalid_path' };

  const init: RequestInit = { method, headers: { Accept: 'application/json' } };
  if (body !== undefined && method !== 'GET') {
    init.headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await client.api(path, init);
  } catch {
    return { ok: false, status: 0, error: 'network' };
  }

  let data: unknown = null;
  try {
    const text = await res.text();
    if (text.length > 0) data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (res.ok) return { ok: true, status: res.status, data };
  const detail = detailOf(data);
  return { ok: false, status: res.status, error: errorOf(data, res.status), ...(detail ? { detail } : {}) };
}

/** The search a successful `DELETE /v1/searches/:id` removed, so the local copy can drop it too. */
export function deletedSearchId(method: unknown, path: unknown, res: BridgeResponse): string | null {
  if (method !== 'DELETE' || !res.ok || typeof path !== 'string') return null;
  const match = /^\/v1\/searches\/([0-9a-f-]{36})$/i.exec(path);
  return match && UUID.test(match[1]!) ? match[1]!.toLowerCase() : null;
}

/** A file name safe on every OS, ending in .csv. */
export function safeCsvFileName(name: unknown): string {
  const raw = typeof name === 'string' ? name : '';
  const cleaned = Array.from(raw, (ch) => (ch.charCodeAt(0) < 0x20 || '<>:"/\\|?*'.includes(ch) ? '-' : ch))
    .join('')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 120);
  const base = cleaned.length > 0 ? cleaned : 'nvoke-export';
  return base.toLowerCase().endsWith('.csv') ? base : `${base}.csv`;
}

/**
 * Streams `GET /v1/searches/:id/export.csv` into `filePath`. The caller shows
 * the save dialog. Never rejects; a partial file is removed on failure.
 */
export async function exportCsvToFile(client: ApiClient, searchId: unknown, filePath: string): Promise<ExportResult> {
  if (typeof searchId !== 'string' || !UUID.test(searchId)) return { saved: false, error: 'That search is gone.' };
  let res: Response;
  try {
    res = await client.api(`/v1/searches/${searchId}/export.csv`, { headers: { Accept: 'text/csv' } });
  } catch {
    return { saved: false, error: 'Can’t reach nvoke. Check your connection.' };
  }
  if (!res.ok || !res.body) {
    const reason =
      res.status === 401
        ? 'Session expired. Sign in again.'
        : res.status === 404
          ? 'That search is gone.'
          : `The server answered ${res.status}.`;
    return { saved: false, error: reason };
  }
  try {
    await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(filePath));
    return { saved: true, filePath };
  } catch (err) {
    await rm(filePath, { force: true }).catch(() => undefined);
    return { saved: false, error: err instanceof Error ? err.message : 'Couldn’t write the file.' };
  }
}
