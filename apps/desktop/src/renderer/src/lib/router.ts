/**
 * A tiny hash router. The packaged renderer loads from file://, where hash
 * routes work without any server rewrites, and six screens do not justify a
 * routing library.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'searches' }
  | { name: 'new'; kind: string | null }
  | { name: 'search'; id: string }
  | { name: 'account' }
  | { name: 'drops' }
  /** The drop editor: an existing drop by id, or a new one, optionally prefilled with a keyword. */
  | { name: 'drop'; id: string | null; keyword?: string | null };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new', kind: new URLSearchParams(query).get('kind') };
  if (parts[0] === 'searches' && parts[1]) return { name: 'search', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'account') return { name: 'account' };
  if (parts[0] === 'drops' && parts[1] === 'new') return { name: 'drop', id: null, keyword: new URLSearchParams(query).get('keyword') };
  if (parts[0] === 'drops' && parts[1]) return { name: 'drop', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'drops') return { name: 'drops' };
  return { name: 'searches' };
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'searches':
      return '#/';
    case 'new':
      return route.kind ? `#/new?kind=${encodeURIComponent(route.kind)}` : '#/new';
    case 'search':
      return `#/searches/${encodeURIComponent(route.id)}`;
    case 'account':
      return '#/account';
    case 'drops':
      return '#/drops';
    case 'drop':
      if (route.id) return `#/drops/${encodeURIComponent(route.id)}`;
      return route.keyword ? `#/drops/new?keyword=${encodeURIComponent(route.keyword)}` : '#/drops/new';
  }
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = routeHref(route);
  if (options.replace) {
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
