import type { z } from 'zod';
import { apiUrl } from '@/lib/api';

export type ToolError = 'invalid' | 'rate_limited' | 'busy' | 'captcha' | 'failed' | 'offline';

export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: ToolError };

export const ERROR_COPY: Record<ToolError, string> = {
  invalid: 'That does not look right. Check the spelling and try again.',
  rate_limited: 'Too many checks from your network. Try again in an hour, or sign up.',
  busy: 'The free checks are busy or used up for today. Sign up and run it in nvoke.',
  captcha: 'The bot check failed. Reload the page and try again.',
  failed: 'Something broke on our side. Try again in a minute.',
  offline: 'Could not reach nvoke. Check your connection and try again.',
};

/** POSTs to a public `/v1/tools/*` route and maps every failure to a ToolError. */
export async function postTool<S extends z.ZodType>(
  path: string,
  body: unknown,
  schema: S,
  timeoutMs = 20_000,
): Promise<ToolResult<z.infer<S>>> {
  let res: Response;
  try {
    res = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    // A timeout means the server is slow, not that the visitor is offline.
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'failed' : 'offline' };
  }

  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const parsed = schema.safeParse(json);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'failed' };
  }

  const code = json && typeof json === 'object' && 'error' in json ? String(json.error) : '';
  if (res.status === 400) return { ok: false, error: 'invalid' };
  if (res.status === 429) return { ok: false, error: code === 'busy' ? 'busy' : 'rate_limited' };
  if (res.status === 403 && code === 'captcha_failed') return { ok: false, error: 'captcha' };
  return { ok: false, error: 'failed' };
}

/** Puts the checked value in the address bar, so the page can be shared. */
export function shareInUrl(key: 'email' | 'domain', value: string) {
  const url = new URL(window.location.href);
  url.search = new URLSearchParams({ [key]: value }).toString();
  window.history.replaceState(null, '', url);
}
