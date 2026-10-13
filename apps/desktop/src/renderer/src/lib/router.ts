/**
 * A tiny hash router. The packaged renderer loads from file://, where hash
 * routes work without any server rewrites, and four screens do not justify a
 * routing library.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'searches' }
  | { name: 'new'; kind: string | null }
  | { name: 'search'; id: string }
  | { name: 'account' };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new', kind: new URLSearchParams(query).get('kind') };
  if (parts[0] === 'searches' && parts[1]) return { name: 'search', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'account') return { name: 'account' };
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
