import { itemDomain } from '@nvoke/shared';
import type { QuickClipboard } from '../ipc/contract';

/** Longer clipboards are documents, not a domain someone copied. */
const MAX_LENGTH = 300;

/**
 * The domain the clipboard names, when all of it is one domain, URL or email
 * address. Null for anything else (prose, lists, company names), so the quick
 * window offers a lookup only for what is clearly a site.
 */
export function clipboardLookup(text: string): QuickClipboard {
  const raw = text.trim();
  if (raw.length === 0 || raw.length > MAX_LENGTH) return null;
  const domain = itemDomain(raw);
  if (!domain) return null;
  return { domain, from: raw.includes('@') && !raw.includes('/') ? 'email' : /^[a-z][a-z0-9+.-]*:\/\/|\//i.test(raw) ? 'url' : 'domain' };
}
