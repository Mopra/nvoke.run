import type { Company } from './types';

/**
 * What to show beside a company the command bar found in the local copy: the
 * address that matched the text, else its first address, else its domain.
 */
export function leadHint(company: Pick<Company, 'domain' | 'emails'>, q: string): string {
  const needle = q.trim().toLowerCase();
  const matched = needle ? company.emails.find((e) => e.address.toLowerCase().includes(needle)) : undefined;
  return (matched ?? company.emails[0])?.address ?? company.domain;
}
