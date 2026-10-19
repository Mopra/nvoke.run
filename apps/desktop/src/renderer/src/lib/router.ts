/**
 * A tiny hash router. The packaged renderer loads from file://, where hash
 * routes work without any server rewrites, and six screens do not justify a
 * routing library.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'searches' }
  | { name: 'new'; kind: string | null }
  /** The website read on file (or running) and the searches it planned. New search always starts fresh. */
  | { name: 'website' }
  /** A search's results, optionally opened with the text filter set to `q`. */
  | { name: 'search'; id: string; q?: string | null }
  | { name: 'account' }
  | { name: 'drops' }
  /** The drop editor: an existing drop by id, or a new one, optionally prefilled with a keyword. */
  | { name: 'drop'; id: string | null; keyword?: string | null };

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '') || '/';
  const [path = '/', query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new', kind: new URLSearchParams(query).get('kind') };
  if (parts[0] === 'searches' && parts[1]) {
    const q = new URLSearchParams(query).get('q');
    return q ? { name: 'search', id: decodeURIComponent(parts[1]), q } : { name: 'search', id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === 'website') return { name: 'website' };
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
      return `#/searches/${encodeURIComponent(route.id)}${route.q ? `?q=${encodeURIComponent(route.q)}` : ''}`;
    case 'website':
      return '#/website';
    case 'account':
      return '#/account';
    case 'drops':
      return '#/drops';
    case 'drop':
      if (route.id) return `#/drops/${encodeURIComponent(route.id)}`;
      return route.keyword ? `#/drops/new?keyword=${encodeURIComponent(route.keyword)}` : '#/drops/new';
  }
}

/*
 * The screens visited this session, oldest first, as hashes. A step back pops
 * the last one, so the trail matches the window's history and Back can return
 * to the screen you came from.
 */
const trail: string[] = [];

function record(): void {
  const hash = window.location.hash || '#/';
  if (trail[trail.length - 2] === hash) trail.pop();
  else if (trail[trail.length - 1] !== hash) trail.push(hash);
}

if (typeof window !== 'undefined') {
  record();
  window.addEventListener('hashchange', record);
}

/** Back to the screen you came from, or to `fallback` when this is the first screen of the session. */
export function goBack(fallback: Route = { name: 'searches' }): void {
  if (trail.length > 1) window.history.back();
  else navigate(fallback);
}

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const href = routeHref(route);
  if (options.replace) {
    if (typeof window !== 'undefined') trail[Math.max(0, trail.length - 1)] = href;
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
