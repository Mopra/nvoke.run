import type { CompaniesPage } from '@nvoke/shared';

/**
 * The loaded pages that hold a shared inbox still waiting for its check
 * (`Company.inboxesPending`): the only ones the follow after switching
 * shared inboxes on reads again, however far the list was scrolled.
 */
export function pendingInboxPages(pages: Pick<CompaniesPage, 'companies'>[]): number[] {
  const out: number[] = [];
  pages.forEach((page, i) => {
    if (page.companies.some((c) => (c.inboxesPending ?? 0) > 0)) out.push(i);
  });
  return out;
}
