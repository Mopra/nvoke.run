import { isDecisionMaker, type Seniority } from '@nvoke/shared';
import { formatNumber } from './format';
import type { Company, Email, Me } from './types';

/**
 * People first: how the results read a company's emails. Pure, so the site
 * can import it too (no `window.nvoke`, no `@/` imports).
 *
 * A person email is one nvoke knows a person for, or a personal address.
 * Role inboxes (info@, sales@) only show for a company with no person,
 * unless the user asks for all of them.
 */

/**
 * Shared inboxes (info@, sales@) are not checked unless the search asks
 * (`Search.checkInboxes`, `PATCH /v1/searches/:id`). The same words on the
 * desktop and the web app.
 */
export const SHARED_INBOXES = {
  pill: 'Shared inboxes',
  label: 'Shared inbox',
  title: 'Shared inboxes aren’t checked',
  body: 'info@ and sales@ don’t reach a person, so nvoke skips them unless you ask.',
  action: 'Check shared inboxes for this search',
  short: 'Check shared inboxes',
  failed: 'Couldn’t switch on shared inboxes',
  noPerson: 'No named person found yet',
  hintOn: 'Showing info@ and sales@ next to people.',
  hintOff: 'Shown only where a company has no person. Turn on to see them all.',
} as const;

/** Verified emails left this month, or null before the account is known. */
export function emailsLeft(me: Pick<Me, 'usage'> | undefined): number | null {
  return me ? Math.max(0, me.usage.emailsLimit - me.usage.emailsVerified) : null;
}

const inboxes = (n: number): string => `${formatNumber(n)} shared ${n === 1 ? 'inbox' : 'inboxes'}`;

/**
 * What switching shared inboxes on costs, for the card: how many it checks
 * (`Search.inboxesSkipped`), that only valid ones count, how many verified
 * emails are left, and a warning when the checks could use more than that.
 */
export function inboxCost(skipped: number | null | undefined, left: number | null): string {
  if (skipped === 0) return 'None skipped so far. Switch it on and nvoke checks the ones it finds next.';
  const what = skipped == null ? 'Only valid ones' : `${inboxes(skipped)} to check. Only valid ones`;
  const allowance = left === null ? 'count against your allowance.' : `count against your allowance: ${formatNumber(left)} verified emails left this month.`;
  const over = skipped != null && left !== null && skipped > left ? ' That could be more than you have left, and checks stop when it runs out.' : '';
  return `${what} ${allowance}${over}`;
}

/** The line over the dock while the checks settle. */
export function inboxChecking(pending: number | null | undefined): string {
  return `Checking ${pending ? inboxes(pending) : 'shared inboxes'}. Valid ones land here as they settle.`;
}

/**
 * How a screen follows the checks it just asked for: every 3 seconds for 2
 * minutes, then every 15, until none is pending, for 30 minutes at most.
 */
export const INBOX_FOLLOW_MS = 30 * 60_000;
export function inboxPollMs(since: number, now: number): number {
  return now - since < 2 * 60_000 ? 3000 : 15_000;
}

export function isPersonEmail(email: Email): boolean {
  return email.person != null || email.kind === 'personal';
}

export function isDecisionMakerEmail(email: Email): boolean {
  return isDecisionMaker(email.person?.seniority ?? null);
}

/** "Anna Berg", or null when nvoke has no name. */
export function personName(email: Email): string | null {
  const p = email.person;
  if (!p) return null;
  const name = `${p.firstName} ${p.lastName}`.trim();
  return name || null;
}

const SENIORITY_RANK: Record<Seniority, number> = { founder: 0, executive: 1, director: 2, manager: 3, staff: 4 };

/** Decision makers first (founders, then executives, then directors), other people, then role inboxes. Stable within a rank. */
function rank(email: Email): number {
  if (email.person?.seniority) return SENIORITY_RANK[email.person.seniority];
  if (isPersonEmail(email)) return 5;
  return 6;
}

export function orderEmails(emails: Email[]): Email[] {
  return emails
    .map((email, i) => ({ email, i }))
    .sort((a, b) => rank(a.email) - rank(b.email) || a.i - b.i)
    .map((x) => x.email);
}

export interface ShownEmails {
  emails: Email[];
  /** True when these are role inboxes standing in for a company with no person. */
  fallback: boolean;
  /** Role inboxes left out because the company has people. */
  hidden: number;
}

/**
 * The emails a company row shows: its people, or its role inboxes when it has
 * none, or everything with `showInboxes`. Role inboxes stay in view next to
 * people none of whom is valid: the server checks one for such a company.
 */
export function shownEmails(company: Company, showInboxes: boolean): ShownEmails {
  const ordered = orderEmails(company.emails);
  if (showInboxes) return { emails: ordered, fallback: false, hidden: 0 };
  const people = ordered.filter(isPersonEmail);
  if (people.length === 0) return { emails: ordered, fallback: ordered.length > 0, hidden: 0 };
  if (!people.some((e) => e.verification === 'valid')) return { emails: ordered, fallback: false, hidden: 0 };
  return { emails: people, fallback: false, hidden: ordered.length - people.length };
}

/** Keeps the companies with a decision maker, and only those emails. */
export function decisionMakersOnly(companies: Company[]): Company[] {
  const out: Company[] = [];
  for (const c of companies) {
    const emails = c.emails.filter(isDecisionMakerEmail);
    if (emails.length > 0) out.push({ ...c, emails });
  }
  return out;
}

/**
 * How nvoke got the address, in words. A pattern guess the mail server
 * accepted is confirmed; on a catch-all domain or before the check it is
 * only a guess.
 */
export function foundViaLabel(email: Email): string | null {
  switch (email.foundVia) {
    case 'page':
    case 'cache':
      return 'On their site';
    case 'pattern':
      return email.verification === 'valid' ? 'Pattern, server confirmed' : 'Pattern guess';
    default:
      return null;
  }
}

export function foundViaHint(email: Email): string | null {
  switch (email.foundVia) {
    case 'page':
      return 'Printed on the company’s own site.';
    case 'cache':
      return 'Printed on the company’s own site, read in an earlier search.';
    case 'pattern':
      return email.verification === 'valid'
        ? 'Built from the domain’s address pattern, and the mail server accepted it.'
        : 'Built from the domain’s address pattern. The mail server could not confirm it.';
    default:
      return null;
  }
}

/** "Strong fit" and friends for Company.fit, or null when it was not scored. */
export function fitLabel(fit: number | null | undefined): string | null {
  if (fit == null) return null;
  if (fit >= 75) return 'Strong fit';
  if (fit >= 50) return 'Good fit';
  if (fit >= 25) return 'Loose fit';
  return 'Weak fit';
}
