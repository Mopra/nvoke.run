// Searches on the account's own key (docs/SPEC.md, "Your own search key").
//
// The wrapper sits in front of the whole search client (paid, fallback and
// free). A search whose account holds a Serper or Brave key runs every paid
// page on that key, through the same result cache, so cached pages stay free
// for everyone. It never touches our providers: no fallback to our key, no
// pause or operator alert when the key is refused, and its requests are not
// counted as ours (the search's source_requests, our monthly budgets). A
// refused key fails the search with a message that says so.

import type { FetchLike } from '../http.js';
import type { OwnSearchKey } from '../search-keys.js';
import type { WebSearchCache } from '../web-cache.js';
import { serperProvider } from './serper.js';
import { PermanentError, SourceUnavailableError, type SourceContext } from './types.js';
import { braveClient, braveProvider, type BraveClient, type BravePageRequest, type PaidSearchProvider } from './web.js';

export interface OwnSearchOptions {
  /** The account's own key, if it has one. Throws when one is stored but cannot be opened. */
  ownKey: (userId: string) => Promise<OwnSearchKey | null>;
  cache?: WebSearchCache;
  fetch?: FetchLike;
}

const LABELS = { serper: 'Serper', brave: 'Brave Search' } as const;

export function ownProvider(key: OwnSearchKey, fetch?: FetchLike): PaidSearchProvider {
  return key.provider === 'serper' ? serperProvider({ apiKey: key.apiKey, fetch }) : braveProvider({ apiKey: key.apiKey, fetch });
}

export function ownSearchClient(ours: BraveClient, opts: OwnSearchOptions): BraveClient {
  // One client per key, so a key's rate limit holds across the searches of the process.
  const clients = new Map<string, BraveClient>();
  const clientFor = (key: OwnSearchKey): BraveClient => {
    const id = `${key.provider}:${key.apiKey}`;
    let client = clients.get(id);
    if (!client) {
      client = braveClient({ apiKey: undefined, cache: opts.cache, provider: ownProvider(key, opts.fetch) });
      clients.set(id, client);
    }
    return client;
  };

  return {
    configured: ours.configured,
    ...(ours.cached ? { cached: ours.cached.bind(ours) } : {}),
    async page(req: BravePageRequest, ctx: SourceContext) {
      const key = ctx.userId ? await opts.ownKey(ctx.userId) : null;
      if (!key) return ours.page(req, ctx);
      const own: SourceContext = {
        ...ctx,
        // Requests billed to the account's key are reported apart from ours.
        onUsage: (event) => ctx.onUsage?.(event === 'request' ? 'own_request' : event),
      };
      try {
        return await clientFor(key).page(req, own);
      } catch (err) {
        if (err instanceof SourceUnavailableError) {
          ctx.log.warn({ userId: ctx.userId, provider: key.provider, reason: err.reason }, 'own search key refused');
          throw new PermanentError(`your own ${LABELS[key.provider]} key was refused: ${err.reason}. Check it on Account.`);
        }
        throw err;
      }
    },
  };
}

export type SearchKeyCheck = { ok: true } | { ok: false; code: 'search_key_rejected'; detail: string } | { ok: false; code: 'source_unavailable' };

/** Tries the key with one search, billed to it. */
export async function checkSearchKey(key: OwnSearchKey, ctx: Pick<SourceContext, 'log'>, fetch?: FetchLike): Promise<SearchKeyCheck> {
  try {
    await ownProvider(key, fetch).fetchPage({ q: 'nvoke lead finder', page: 0 }, { limit: 1, signal: AbortSignal.timeout(30_000), log: ctx.log });
    return { ok: true };
  } catch (err) {
    if (err instanceof SourceUnavailableError) return { ok: false, code: 'search_key_rejected', detail: err.reason };
    ctx.log.warn({ err, provider: key.provider }, 'search key check failed');
    return { ok: false, code: 'source_unavailable' };
  }
}
