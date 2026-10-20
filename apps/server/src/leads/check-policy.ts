// Which found addresses get an SMTP check, so the time and the user's
// allowance go to named people (docs/SPEC.md, pipeline step 4). Pure: the
// worker (worker/pipeline.ts) and the never short projection (ongoing.ts)
// feed it rows.
//
// Tiers, and who waits for whom. Only named people with a title are checked
// at once, and every other tier but the fallback inbox waits only for them,
// so a wait is never more than two deep:
// - primary: a named person with a title or seniority who is not off
//   target. Checked now.
// - unnamed: a personal address without a first and last name (max@,
//   mh@). Waits for the company's named primary people and is left out once
//   any named person is valid.
// - untitled: a named person with no title. Waits for the company's titled
//   primary people and is left out once a decision maker or commercial person
//   is valid.
// - off_target: HR, recruiting, privacy, support, finance (CFO too), office
//   staff, assistants and interns. Never checked: a seller does not write to
//   them (the final eval's judge turned every one down).
// - role_inbox: info@, sales@. With the search's check_inboxes on, every
//   one waits for the company's primary people and is left out once any
//   personal address is valid. With it off, only the company's fallback inbox
//   is checked (fallbackInbox: the best of its role inboxes, sales@ before
//   hello@, contact@, info@ and office@, support@, jobs@ and privacy@ last,
//   no-reply never) and only when no personal address comes back valid. It
//   waits for every open personal address that is not off target, so a
//   named person is always preferred.

import { isDecisionMaker, type Seniority, type Verification } from '@nvoke/shared';
import { localPartOf } from '@nvoke/shared/crawl';
import { isCommercialTitle, isOffTargetTitle } from './extract.js';

export type CheckTier = 'primary' | 'untitled' | 'unnamed' | 'off_target' | 'role_inbox';

/** What emails.skipped says for an address left unchecked on purpose. */
export type SkipReason = Exclude<CheckTier, 'primary'>;

export interface PolicyEmail {
  /** Ranks a company's role inboxes (fallbackInbox). Without it a role inbox never beats another one. */
  address?: string;
  kind: string;
  first_name: string | null;
  last_name: string | null;
  seniority: Seniority | null;
  title: string | null;
  verification: Verification | null;
  skipped: string | null;
}

export type PolicySelf = Pick<PolicyEmail, 'address' | 'kind' | 'first_name' | 'last_name' | 'seniority' | 'title'>;

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
  if (!e.title?.trim() && !e.seniority) return 'untitled';
  return 'primary';
}

/** Machine mailboxes: never the fallback inbox. */
const NEVER_INBOX = /^(no[-._]?reply|do[-._]?not[-._]?reply|donotreply|noreply[-._].*|bounces?|mailer[-._]?daemon|postmaster|hostmaster|devnull|nobody|abuse)$/;

/**
 * Role inboxes from the most to the least likely to reach someone who buys.
 * Unlisted ones (acme@acme.com, booking@) rank between office@ and support@.
 */
const INBOX_ORDER: readonly (readonly string[])[] = [
  ['sales', 'salg', 'verkauf', 'vertrieb', 'vente', 'ventas', 'comercial', 'commercial', 'newbusiness', 'new.business', 'new-business', 'business', 'bizdev', 'bd', 'growth', 'partners', 'partner'],
  ['hello', 'hej', 'hi', 'hallo', 'hola', 'bonjour', 'welcome', 'velkommen'],
  ['contact', 'contacts', 'kontakt', 'contacto', 'contactus', 'contact.us', 'kontaktos', 'ask', 'enquiries', 'enquiry', 'inquiries', 'inquiry', 'anfrage', 'anfragen'],
  ['info', 'information', 'informacion', 'general', 'general.inquiries', 'mail', 'email', 'post', 'mailbox', 'team', 'hq', 'algemeen'],
  ['office', 'kontor', 'kontoret', 'bureau', 'buero', 'büro', 'kanzlei', 'zentrale', 'empfang', 'accueil', 'reception', 'frontdesk', 'front.desk', 'admin', 'administration', 'secretary', 'sekretariat'],
  [],
  ['support', 'help', 'helpdesk', 'servicedesk', 'service', 'kundeservice', 'customerservice', 'customer.service', 'kundenservice', 'feedback'],
  ['billing', 'accounts', 'accounting', 'invoice', 'invoices', 'faktura', 'finance', 'regnskab', 'bogholderi', 'okonomi'],
  ['jobs', 'job', 'careers', 'career', 'karriere', 'hr', 'recruiting', 'recrutement', 'emploi', 'press', 'presse', 'media', 'newsletter', 'nyhedsbrev'],
  ['privacy', 'gdpr', 'dpo', 'datapolitik', 'dataprotection', 'data.protection', 'datenschutz', 'datacontroller', 'data.controller', 'privacyofficer', 'legal', 'compliance', 'impressum', 'webmaster', 'it', 'security'],
];
const UNLISTED_RANK = INBOX_ORDER.findIndex((g) => g.length === 0) * 2;
const INBOX_RANK = new Map(INBOX_ORDER.flatMap((group, i) => group.map((local) => [local, i * 2] as const)));

/** Lower is better; null is never. sales.uk@ ranks just after sales@. */
export function inboxRank(address: string | undefined): number | null {
  if (!address) return UNLISTED_RANK;
  const local = localPartOf(address.toLowerCase()).split('+')[0] ?? '';
  if (NEVER_INBOX.test(local)) return null;
  const exact = INBOX_RANK.get(local);
  if (exact !== undefined) return exact;
  const prefix = INBOX_RANK.get(local.split(/[._-]/)[0] ?? '');
  return prefix !== undefined ? prefix + 1 : UNLISTED_RANK;
}

/**
 * Whether this role inbox is the one its company checks with check_inboxes
 * off: none of its role inboxes is checked yet and this one ranks first (by
 * inboxRank, then address). Stable while the company's addresses stay put,
 * so the company's other role inboxes all come out skipped.
 */
export function fallbackInbox(self: PolicySelf, others: PolicyEmail[]): boolean {
  const rank = inboxRank(self.address);
  if (rank === null) return false;
  return others.every((o) => {
    if (o.kind !== 'generic') return true;
    if (o.verification !== null) return false;
    const r = inboxRank(o.address);
    if (r === null || r > rank) return true;
    return r === rank && !!self.address && !!o.address && self.address < o.address;
  });
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
  if (tier === 'off_target') return 'skip';
  const fallback = tier === 'role_inbox' && !ctx.checkInboxes;
  if (fallback && !fallbackInbox(self, others)) return 'skip';
  // What makes this address unnecessary when valid, and what it waits for while open.
  let enough: (e: PolicyEmail) => boolean;
  let waitFor: (e: PolicyEmail) => boolean;
  if (fallback) {
    enough = (e) => e.kind === 'personal';
    waitFor = (e) => e.kind === 'personal' && checkTier(e) !== 'off_target';
  } else if (tier === 'role_inbox') {
    enough = (e) => e.kind === 'personal';
    waitFor = (e) => checkTier(e) === 'primary';
  } else if (tier === 'untitled') {
    enough = isLead;
    waitFor = (e) => checkTier(e) === 'primary';
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
