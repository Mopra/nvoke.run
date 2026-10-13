import type { SearchInput } from './types';

/**
 * Turns what someone types in the quick window into a search. "dentists in
 * Aarhus" (or "dentists near Aarhus") is a local search, anything else is a
 * web search on that keyword. Null while there is nothing to search for.
 */
export function parseQuickSearch(query: string): Extract<SearchInput, { kind: 'local' | 'web' }> | null {
  const text = query.trim().replace(/\s+/g, ' ');
  if (text.length < 2) return null;
  const local = /^(.{1,100}?)\s+(?:in|near|i|nær)\s+(.{1,200})$/i.exec(text);
  if (local?.[1] && local[2]) return { kind: 'local', params: { niche: local[1], location: local[2] } };
  return { kind: 'web', params: { keyword: text.slice(0, 200) } };
}
