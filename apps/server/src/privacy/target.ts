// Parses what a data subject or the operator names: one address or a domain.

import { hostToDomain, isWebmailDomain, normalizeDomain, registrableDomain } from '../leads/domain.js';

export type PrivacyTarget = { address: string } | { domain: string };

/** Lowercased, trimmed address, or null when it does not look like one. */
export function parseAddress(input: string): string | null {
  const address = input.trim().toLowerCase();
  const at = address.lastIndexOf('@');
  if (at <= 0 || at === address.length - 1 || /\s/.test(address)) return null;
  return hostToDomain(address.slice(at + 1)) ? address : null;
}

/**
 * The registrable domain behind a domain, host or URL ("https://www.shop.acme.dk/x"
 * becomes "acme.dk"), or null when it is not a public host name. Erasing a
 * domain covers it and every subdomain.
 */
export function parseDomain(input: string): string | null {
  const host = normalizeDomain(input.trim().toLowerCase());
  return host ? registrableDomain(host) : null;
}

/** An address when the input has an "@", otherwise a domain. */
export function parseTarget(input: string): PrivacyTarget | null {
  if (input.includes('@')) {
    const address = parseAddress(input);
    return address ? { address } : null;
  }
  const domain = parseDomain(input);
  return domain ? { domain } : null;
}

/**
 * Shared mailbox providers (the webmail list in leads/domain.ts). Suppressing
 * one of these as a domain would hide every small business that uses it, so
 * the public opt-out page does not accept them as domains (an address on them
 * is fine). The operator can still do it from the CLI.
 */
export function isSharedMailDomain(domain: string): boolean {
  return isWebmailDomain(domain);
}
