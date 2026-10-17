// Which found addresses get an SMTP check, so the time and the user's
// allowance go to named people (docs/SPEC.md, pipeline step 4). Pure: the
// worker (worker/pipeline.ts) and the never short projection (ongoing.ts)
// feed it rows.
//
// Tiers, and who waits for whom. Only named people are checked at once, and
// every other tier waits only for them, so no waiting address ever waits
// for another waiting one:
// - primary: a named person who is not off target. Checked now.
// - unnamed: a personal address without a first and last name (max@,
//   mh@). Waits for the company's named primary people and is left out once
//   any named person is valid.
// - off_target: HR, recruiting, privacy, support, bookkeeping, office staff,
//   assistants and interns. Waits for the company's decision makers and
//   commercial people (themselves primary) and is left out once one is valid.
// - role_inbox: info@, sales@. Never checked unless the search asks for it
//   (searches.check_inboxes); then it waits for the company's primary people
//   and is left out once any personal address is valid.

import { isDecisionMaker, type Seniority, type Verification } from '@nvoke/shared';
import { isCommercialTitle, isOffTargetTitle } from './extract.js';

export type CheckTier = 'primary' | 'unnamed' | 'off_target' | 'role_inbox';

/** What emails.skipped says for an address left unchecked on purpose. */
export type SkipReason = Exclude<CheckTier, 'primary'>;

export interface PolicyEmail {
  kind: string;
  first_name: string | null;
  last_name: string | null;
  seniority: Seniority | null;
  title: string | null;
  verification: Verification | null;
  skipped: string | null;
}

export type PolicySelf = Pick<PolicyEmail, 'kind' | 'first_name' | 'last_name' | 'seniority' | 'title'>;

export interface PolicyContext {
  /** The company's crawl or people job is still to run: more addresses may come. */
  crawlPending: boolean;
  peoplePending: boolean;
  /** The search asked for its role inboxes to be checked (searches.check_inboxes). */
  checkInboxes: boolean;
  /** Waited long enough: decide now, never defer again. */
  force?: boolean;
}

export type Decision = 'check' | 'defer' | 'skip';

const named = (e: Pick<PolicyEmail, 'first_name' | 'last_name'>) => !!e.first_name?.trim() && !!e.last_name?.trim();

export function checkTier(e: PolicySelf): CheckTier {
  if (e.kind === 'generic') return 'role_inbox';
  if (isOffTargetTitle(e.title, e.seniority)) return 'off_target';
  if (!named(e)) return 'unnamed';
  return 'primary';
}

/** A decision maker or someone in sales, growth, marketing or partnerships, never off target. */
function isLead(e: PolicyEmail): boolean {
  return checkTier(e) === 'primary' && (isDecisionMaker(e.seniority) || isCommercialTitle(e.title));
}

/**
 * Check now, later or never. `others` are the company's other addresses.
 * With `force` a check that would wait is decided now: left out when what
 * it waited for came back valid, else checked.
 */
export function checkPolicy(self: PolicySelf, others: PolicyEmail[], ctx: PolicyContext): Decision {
  const tier = checkTier(self);
  if (tier === 'primary') return 'check';
  if (tier === 'role_inbox' && !ctx.checkInboxes) return 'skip';
  // What makes this address unnecessary when valid, and what it waits for while open.
  let enough: (e: PolicyEmail) => boolean;
  let waitFor: (e: PolicyEmail) => boolean;
  if (tier === 'role_inbox') {
    enough = (e) => e.kind === 'personal';
    waitFor = (e) => checkTier(e) === 'primary';
  } else if (tier === 'off_target') {
    enough = isLead;
    waitFor = isLead;
  } else {
    enough = (e) => e.kind === 'personal' && named(e);
    waitFor = (e) => checkTier(e) === 'primary';
  }
  if (others.some((e) => enough(e) && e.verification === 'valid')) return 'skip';
  if (ctx.force) return 'check';
  if (ctx.crawlPending || ctx.peoplePending) return 'defer';
  if (others.some((e) => waitFor(e) && e.verification === null && e.skipped === null)) return 'defer';
  return 'check';
}

/**
 * Whether an unchecked address is still expected to be checked, for the
 * never short projection: primary people always, the rest unless the
 * company's settled addresses already make them unnecessary.
 */
export function stillToCheck(self: PolicySelf, others: PolicyEmail[], checkInboxes: boolean): boolean {
  return checkPolicy(self, others, { crawlPending: false, peoplePending: false, checkInboxes, force: true }) === 'check';
}
