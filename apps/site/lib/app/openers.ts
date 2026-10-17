import type { CompaniesPage, Company, DraftOpenersResponse } from '@nvoke/shared';
import { formatNumber } from './desktop';
import { POLL_MS } from './quota';

/**
 * Openers per company: one drafted first line from the company's own site,
 * for copying into the user's own outreach. nvoke never sends.
 */

/** Openers are only drafted for companies with at least one valid email. */
export function canDraftOpener(company: Pick<Company, 'emails'>): boolean {
  return company.emails.some((e) => e.verification === 'valid');
}

export function anyOpenerQueued(companies: Pick<Company, 'opener'>[]): boolean {
  return companies.some((c) => c.opener?.status === 'queued');
}

/** Poll the companies while the search runs or any loaded opener is still being written. */
export function companiesPollInterval(live: boolean, pages: Pick<CompaniesPage, 'companies'>[] | undefined): number | false {
  if (live) return POLL_MS;
  return pages?.some((p) => anyOpenerQueued(p.companies)) ? POLL_MS : false;
}

export interface OpenersNotice {
  title: string;
  description?: string;
}

/** What to say after `POST /v1/searches/:id/openers`. */
export function openersNotice({ queued, skipped }: DraftOpenersResponse): OpenersNotice {
  if (queued === 0) {
    return { title: 'No openers to draft', description: 'Every company here has one already or no valid email.' };
  }
  const title = `Drafting ${formatNumber(queued)} ${queued === 1 ? 'opener' : 'openers'}.`;
  if (skipped === 0) return { title };
  return { title, description: `${formatNumber(skipped)} skipped: no valid email or already drafted.` };
}

/** The page an opener's fact comes from, short: "/about", or "home page" for the root. */
export function openerSourceLabel(sourceUrl: string): string {
  try {
    const path = new URL(sourceUrl).pathname.replace(/\/+$/, '');
    return path || 'home page';
  } catch {
    return sourceUrl;
  }
}
