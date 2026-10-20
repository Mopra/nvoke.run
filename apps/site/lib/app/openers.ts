import type { CompaniesPage, Company, DraftOpenersResponse } from '@nvoke/shared';
import { formatNumber } from './desktop';
import { ONGOING_POLL_MS, POLL_MS } from './quota';

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

/**
 * Every loaded page is refetched only while an opener is being written,
 * since openers land on any company, wherever it sits in the list.
 */
export function companiesPollInterval(pages: Pick<CompaniesPage, 'companies'>[] | undefined): number | false {
  return pages?.some((p) => anyOpenerQueued(p.companies)) ? POLL_MS : false;
}

/**
 * While a search runs, or slowly while it keeps filling, only the edges of
 * the loaded list are polled (`edgePages`), however far it was scrolled.
 */
export function edgePollInterval(live: boolean, ongoing: boolean): number | false {
  if (live) return POLL_MS;
  return ongoing ? ONGOING_POLL_MS : false;
}

/**
 * The loaded pages a live poll refetches: the first (the rows most likely on
 * screen, and the total) and the last, where new companies land since the
 * list is oldest first.
 */
export function edgePages(count: number): number[] {
  if (count <= 0) return [];
  return count === 1 ? [0] : [0, count - 1];
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
