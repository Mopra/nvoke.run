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

/** Words that join a description of a customer ("agencies that build sites"), never a keyword or a place. */
const DESCRIBES = /\b(?:with|that|who|which|selling|hiring|owned|doing|using|between)\b/i;

/**
 * Typed text as a plain words (`icp`) search, up to 1000 companies, or null
 * while there is too little to describe anyone. `describes` is true when it
 * reads like a description (five words or more, or joining words like
 * "with" and "that") and not like a local search, so the quick window
 * offers it first. Short queries like "dental clinics aarhus" keep the web
 * or local search first.
 */
export function parseQuickIcp(query: string): { input: Extract<SearchInput, { kind: 'icp' }>; describes: boolean } | null {
  const text = query.trim().replace(/\s+/g, ' ');
  if (text.length < 3) return null;
  const words = text.split(' ').length;
  // "dentists in Aarhus" stays the local search it always was.
  const local = parseQuickSearch(text)?.kind === 'local';
  return {
    input: { kind: 'icp', params: { description: text.slice(0, 2000) }, limit: 1000 },
    describes: !local && (words >= 5 || DESCRIBES.test(text)),
  };
}
