/**
 * Turning pasted text into the items of a `domains` search. Shared so the
 * desktop (paste, clipboard, OCR, CSV) and the server agree on what a list
 * holds and which items are domains.
 */

/** A host with at least one dot and a letter TLD. Loose on purpose: the server normalizes properly. */
const HOST = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*[a-z0-9]$/i;

/**
 * The domain an item names, or null when it is a company name. Takes a bare
 * domain ("acme.com"), a URL ("https://www.acme.com/contact") or an email
 * address ("jane@acme.com", which stands for its domain).
 */
export function itemDomain(item: string): string | null {
  const raw = item.trim();
  if (raw.length === 0 || /\s/.test(raw)) return null;
  let host = raw;
  const at = host.lastIndexOf('@');
  if (at !== -1 && !host.includes('/')) host = host.slice(at + 1);
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/^\/\//, '');
  host = host.split(/[/?#]/)[0] ?? '';
  host = host.replace(/:\d+$/, '').replace(/\.$/, '').toLowerCase();
  if (host.startsWith('www.')) host = host.slice(4);
  return HOST.test(host) && host.length <= 253 ? host : null;
}

/** Bullets, numbering and quotes that lists pasted from documents carry. */
function clean(part: string): string {
  return part
    .trim()
    .replace(/^(?:[-*•●▪]|\d{1,4}[.)])\s+/, '')
    .replace(/^["'“‘](.*)["'”’]$/, '$1')
    .trim();
}

/** The most items one list may hold (`SEARCH_LIMIT_MAX`). */
const MAX_ITEMS = 25_000;

/**
 * Splits pasted text into list items, one per line. A line splits further on
 * commas, semicolons and tabs only when every part is a domain, so
 * "Acme, Inc." stays one company while "a.com, b.com" becomes two. Items are
 * trimmed, stripped of bullets and quotes, and deduplicated (domains by
 * host, names ignoring case).
 */
export function splitList(text: string, max = MAX_ITEMS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r\n|\r|\n/)) {
    const parts = line.split(/[,;\t]/).map(clean).filter(Boolean);
    const items = parts.length > 1 && parts.every((p) => itemDomain(p) !== null) ? parts : [clean(line.replace(/\t+/g, ' '))];
    for (const item of items) {
      if (!item || item.length > 200) continue;
      const key = itemDomain(item) ?? item.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= max) return out;
    }
  }
  return out;
}
