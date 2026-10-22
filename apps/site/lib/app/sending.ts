import {
  DEFAULT_DAILY_CAP,
  DEFAULT_SCHEDULE,
  MAILBOX_PRESETS,
  MAX_DAILY_CAP,
  MAX_STEPS,
  REVIEW_MINUTES,
  type Campaign,
  type CampaignLeadStatus,
  type CampaignListResponse,
  type CampaignSchedule,
  type CampaignSource,
  type CampaignStatus,
  type CampaignStep,
  type ConnectMailboxRequest,
  type CreateCampaignRequest,
  type Drop,
  type Mailbox,
  type MailboxListResponse,
  type MailboxPreset,
  type MailboxStatus,
  type Search,
  type UpdateCampaignRequest,
  type UpdateMailboxRequest,
} from '@nvoke/shared';
import { ApiError } from './api';
import { formatNumber, isActive, searchTitle } from './desktop';

/**
 * Sending in the web app (docs/sending/plan.md, "Web app"): the paths, the
 * polling rules, the mailbox and campaign forms as data and the small
 * readings the screens show. The screens are in components/app/sending.
 */

export const MAILBOXES_PATH = '/app/mailboxes';
export const CAMPAIGNS_PATH = '/app/campaigns';
export const NEW_CAMPAIGN_PATH = '/app/campaigns/new';
export const REPLIES_PATH = '/app/replies';
export const campaignPath = (id: string, leadId?: string): string =>
  `${CAMPAIGNS_PATH}/${encodeURIComponent(id)}${leadId ? `?lead=${encodeURIComponent(leadId)}` : ''}`;

/* Who sees sending */

/**
 * Sending is internal only (docs/sending/plan.md, "Internal only"): the
 * server answers 404 on every sending route for an account off its
 * allowlist. GET /v1/sending decides what the web app shows: `internal`
 * once it answered 200, `hidden` on a 404 (also when an earlier 200 is
 * still cached), `checking` before the first answer and `error` when it
 * failed some other way. Only `internal` shows a link or a sending screen.
 */
export type SendingAccess = 'checking' | 'internal' | 'hidden' | 'error';

export function isNotInternal(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function sendingAccess(query: { data?: unknown; error?: unknown }): SendingAccess {
  if (isNotInternal(query.error)) return 'hidden';
  if (query.data !== undefined && query.data !== null) return 'internal';
  return query.error ? 'error' : 'checking';
}

/** The summary is read again every minute for the unread count, never once it said 404. */
export function sendingSummaryPollInterval(error: unknown): number | false {
  return isNotInternal(error) ? false : REPLIES_POLL_MS;
}

/** A 404 is final (not internal) and so is a 503 (switched off); anything else gets two more tries. */
export function retrySendingSummary(count: number, error: unknown): boolean {
  if (isNotInternal(error) || isSendingUnavailable(error)) return false;
  return count < 2;
}

/* Polling */

/** While Claude writes, the review list fills fast. */
export const WRITING_POLL_MS = 2_000;
/** While a campaign is scheduled or sends, a send lands every few minutes at most. */
export const SENDING_POLL_MS = 30_000;
/** A mailbox check (SMTP, IMAP, a test email) takes seconds. */
export const CHECKING_POLL_MS = 2_000;
/** Replies come in through the worker's IMAP poll, every few minutes. */
export const REPLIES_POLL_MS = 60_000;

/**
 * How often a campaign is read again: every 2 seconds while it is being
 * written (a draft is about to be), every 30 while it is scheduled or
 * sending (an autopilot campaign also writes new leads then), never when it
 * waits for the user (review, paused) or has ended.
 */
export function campaignPollInterval(campaign: Pick<Campaign, 'status' | 'writing'> | undefined): number | false {
  if (!campaign) return false;
  if (campaign.status === 'draft' || campaign.status === 'writing') return WRITING_POLL_MS;
  if (campaign.status === 'scheduled' || campaign.status === 'sending') return campaign.writing > 0 ? WRITING_POLL_MS : SENDING_POLL_MS;
  return false;
}

/** The list polls at the fastest pace any of its campaigns needs. */
export function campaignsPollInterval(data: CampaignListResponse | undefined): number | false {
  if (!data) return false;
  const paces = data.campaigns.map(campaignPollInterval).filter((p): p is number => p !== false);
  return paces.length > 0 ? Math.min(...paces) : false;
}

/** The mailbox list polls only while a mailbox is being checked. */
export function mailboxesPollInterval(data: MailboxListResponse | undefined): number | false {
  return data?.mailboxes.some((m) => m.status === 'checking') ? CHECKING_POLL_MS : false;
}

/* Labels */

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  writing: 'Writing',
  review: 'Ready for review',
  scheduled: 'Scheduled',
  sending: 'Sending',
  paused: 'Paused',
  done: 'Done',
  canceled: 'Canceled',
};

export const LEAD_STATUS_LABEL: Record<CampaignLeadStatus, string> = {
  writing: 'Writing',
  queued: 'Queued',
  active: 'In sequence',
  replied: 'Replied',
  bounced: 'Bounced',
  opted_out: 'Opted out',
  failed: 'Failed',
  done: 'Finished',
  skipped: 'Skipped',
  stopped: 'Stopped',
};

export const MAILBOX_STATUS_LABEL: Record<MailboxStatus, string> = {
  checking: 'Checking',
  active: 'Active',
  paused: 'Paused',
  error: 'Needs attention',
  disconnected: 'Disconnected',
};

/** Why a lead was not enrolled, in words. Unknown reasons show as they come. */
export const SKIP_REASON_LABEL: Record<string, string> = {
  country: 'Blocked country (Denmark, Germany)',
  suppressed: 'Opted out or suppressed',
  not_valid: 'Not a verified address',
  catch_all: 'Catch-all address',
  not_person: 'No named person',
  contacted: 'Contacted in the last 90 days',
  per_company: 'Another person at the company',
  daily_limit: 'Over the daily limit',
  write_failed: 'Claude could not write it',
  too_similar: 'Too like another email in the campaign',
  resolved: 'Fixed before it went out',
  unreachable: 'Site did not answer the last check',
};

export function skipReasonLabel(reason: string): string {
  return SKIP_REASON_LABEL[reason] ?? reason.replaceAll('_', ' ');
}

/** The skipped counts, biggest first, without zeros. */
export function skippedLines(skipped: Record<string, number>): { reason: string; label: string; count: number }[] {
  return Object.entries(skipped)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, label: skipReasonLabel(reason), count }));
}

export function skippedTotal(skipped: Record<string, number>): number {
  return Object.values(skipped).reduce((sum, n) => sum + n, 0);
}

/** The lead filters on a campaign's page: every lead, or one state. */
export const LEAD_FILTERS = ['all', 'queued', 'active', 'replied', 'bounced', 'opted_out', 'stopped', 'skipped'] as const;
export type LeadFilter = (typeof LEAD_FILTERS)[number];

/**
 * Where a campaign stands, as its LED shows it: `busy` while written or
 * sent, `ready` when it waits for the user's start, `waiting` while
 * scheduled, `off` when paused or ended.
 */
export type CampaignLight = 'busy' | 'ready' | 'waiting' | 'off';

export function campaignLight(status: CampaignStatus): CampaignLight {
  if (status === 'draft' || status === 'writing' || status === 'sending') return 'busy';
  if (status === 'review') return 'ready';
  if (status === 'scheduled') return 'waiting';
  return 'off';
}

export const canStart = (c: Pick<Campaign, 'status'>): boolean => c.status === 'review';
export const canPause = (c: Pick<Campaign, 'status'>): boolean => c.status === 'scheduled' || c.status === 'sending' || c.status === 'writing';
export const canResume = (c: Pick<Campaign, 'status'>): boolean => c.status === 'paused';
/** Written emails can be edited and leads stopped until they are sent. */
export const canEditLead = (status: CampaignLeadStatus): boolean => status === 'queued' || status === 'active';

/** "14:32", in the browser's time zone unless one is given. */
export function clockTime(at: number | string, timeZone?: string): string {
  return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
}

/** When the first email can go out if the campaign starts at `now`: after the review hour. */
export function reviewEnds(now: number = Date.now()): number {
  return now + REVIEW_MINUTES * 60_000;
}

/**
 * The line under a campaign's state: the review hour while it runs, what
 * Start would do while it waits, how many are still being written.
 */
export function campaignNote(c: Pick<Campaign, 'status' | 'reviewUntil' | 'writing' | 'autopilot' | 'holdHours'>, now: number = Date.now(), timeZone?: string): string {
  if (c.status === 'draft' || c.status === 'writing') return `Claude is writing ${c.writing > 0 ? `${formatNumber(c.writing)} leads` : 'the emails'}`;
  if (c.status === 'review') return `Start, then the first email goes out no earlier than ${clockTime(reviewEnds(now), timeZone)}`;
  if (c.status === 'scheduled' && c.reviewUntil && Date.parse(c.reviewUntil) > now) {
    return `Review until ${clockTime(c.reviewUntil, timeZone)}, then sending in working hours`;
  }
  if (c.status === 'scheduled' || c.status === 'sending') {
    return c.autopilot ? `New leads are written and sent ${c.holdHours} h later` : 'Sending in the recipients’ working hours';
  }
  if (c.status === 'paused') return 'Paused: nothing is enrolled or sent';
  return CAMPAIGN_STATUS_LABEL[c.status];
}

const WEEKDAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon to Fri, 9 to 17" or "Mon, Wed, Fri, 9 to 17". */
export function scheduleLabel(s: CampaignSchedule): string {
  const days = [...new Set(s.days)].sort((a, b) => a - b);
  const run = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  const dayText = run ? `${WEEKDAY[days[0]! - 1]} to ${WEEKDAY[days.at(-1)! - 1]}` : days.map((d) => WEEKDAY[d - 1]).join(', ');
  return `${dayText}, ${s.startHour} to ${s.endHour}`;
}

export function weekdayLabel(day: number): string {
  return WEEKDAY[day - 1] ?? String(day);
}

/** What a campaign sends to, as one line. */
export function sourceLabel(
  c: Pick<Campaign, 'source' | 'searchId' | 'dropId'>,
  searches: Search[] | undefined,
  drops: Drop[] | undefined,
): string {
  if (c.source === 'drop') {
    const drop = drops?.find((d) => d.id === c.dropId);
    return `Follows the drop ${drop ? drop.name : ''}`.trim();
  }
  const search = searches?.find((s) => s.id === c.searchId);
  const name = search ? searchTitle(search) : null;
  if (c.source === 'search') return name ? `Follows ${name}` : 'Follows a search';
  return name ? `The leads of ${name}` : 'A list of leads';
}

export function leadName(lead: { firstName: string | null; lastName: string | null; address: string }): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.address;
}

/* Errors */

/** The sending codes in words; anything else keeps the API's message. */
export function sendingError(error: unknown): string {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Something went wrong.';
  switch (error.code) {
    case 'sending_unavailable':
      return 'Sending is switched off on this server.';
    case 'too_many_mailboxes':
      return 'You have 20 mailboxes. Remove one first.';
    case 'mailbox_exists':
    case 'exists':
      return 'That mailbox is connected already.';
    case 'too_many_campaigns':
      return 'You have 50 campaigns. Delete one first.';
    case 'bad_mailbox':
      return 'One of the mailboxes is gone or not yours. Pick them again.';
    case 'no_leads':
      return 'That source has no verified leads to send to yet.';
    case 'clerk_session_required':
    case 'session_required':
      return 'Start it from the web app while signed in.';
    case 'not_found':
      return 'It is gone. Probably deleted in another tab.';
    default:
      return error.status === 404 ? 'It is gone. Probably deleted in another tab.' : error.message;
  }
}

export function isSendingUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'sending_unavailable' || error.status === 503);
}

/* The mailbox form */

/** Where a known address lives, so the form fills the servers. Custom domains need a pick. */
const PRESET_DOMAINS: Record<string, string> = {
  'gmail.com': 'google',
  'googlemail.com': 'google',
  'outlook.com': 'microsoft',
  'hotmail.com': 'microsoft',
  'live.com': 'microsoft',
  'msn.com': 'microsoft',
  'icloud.com': 'icloud',
  'me.com': 'icloud',
  'mac.com': 'icloud',
  'fastmail.com': 'fastmail',
  'fastmail.fm': 'fastmail',
  'zoho.com': 'zoho',
  'zoho.eu': 'zoho',
  'zohomail.eu': 'zoho',
};

export function presetForAddress(address: string): MailboxPreset | null {
  const domain = address.trim().toLowerCase().split('@')[1] ?? '';
  const key = PRESET_DOMAINS[domain];
  return key ? (MAILBOX_PRESETS.find((p) => p.key === key) ?? null) : null;
}

export function presetByKey(key: string): MailboxPreset {
  return MAILBOX_PRESETS.find((p) => p.key === key) ?? MAILBOX_PRESETS.at(-1)!;
}

export interface MailboxForm {
  address: string;
  displayName: string;
  preset: string;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
  username: string;
  password: string;
  warm: boolean;
}

export function emptyMailboxForm(): MailboxForm {
  const google = presetByKey('google');
  return {
    address: '',
    displayName: '',
    preset: google.key,
    smtpHost: google.smtpHost,
    smtpPort: google.smtpPort,
    imapHost: google.imapHost,
    imapPort: google.imapPort,
    username: '',
    password: '',
    warm: true,
  };
}

/** Picks a preset: its servers replace the typed ones ("Other" keeps them). */
export function applyPreset(form: MailboxForm, key: string): MailboxForm {
  const p = presetByKey(key);
  if (p.key === 'other') return { ...form, preset: p.key };
  return { ...form, preset: p.key, smtpHost: p.smtpHost, smtpPort: p.smtpPort, imapHost: p.imapHost, imapPort: p.imapPort };
}

/** A typed address fills the preset when its domain is known, and a display name from the local part. */
export function withAddress(form: MailboxForm, address: string): MailboxForm {
  const next = { ...form, address };
  const preset = presetForAddress(address);
  return preset && preset.key !== form.preset ? applyPreset(next, preset.key) : next;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function mailboxFormProblem(form: MailboxForm): string | null {
  if (!EMAIL.test(form.address.trim())) return 'Type the mailbox’s address.';
  if (!form.displayName.trim()) return 'Type the name recipients see.';
  if (!form.smtpHost.trim() || !form.imapHost.trim()) return 'Fill in the SMTP and IMAP servers.';
  if (!validPort(form.smtpPort) || !validPort(form.imapPort)) return 'A port is a number from 1 to 65535.';
  if (!form.password) return 'Paste the app password.';
  return null;
}

const validPort = (p: number): boolean => Number.isInteger(p) && p >= 1 && p <= 65535;

export function buildConnectMailbox(form: MailboxForm): ConnectMailboxRequest | null {
  if (mailboxFormProblem(form)) return null;
  const address = form.address.trim().toLowerCase();
  const username = form.username.trim();
  return {
    address,
    displayName: form.displayName.trim(),
    smtpHost: form.smtpHost.trim(),
    smtpPort: form.smtpPort,
    imapHost: form.imapHost.trim(),
    imapPort: form.imapPort,
    ...(username && username !== address ? { username } : {}),
    password: form.password,
    warm: form.warm,
  };
}

/** The mailbox settings form: what changed, or null when nothing did. */
export interface MailboxSettings {
  displayName: string;
  dailyCap: number;
  signature: string;
  warm: boolean;
  password: string;
}

export function mailboxSettings(m: Mailbox): MailboxSettings {
  return { displayName: m.displayName, dailyCap: m.dailyCap, signature: m.signature, warm: m.warm, password: '' };
}

export function clampCap(cap: number): number {
  return Math.min(MAX_DAILY_CAP, Math.max(1, Math.round(cap) || DEFAULT_DAILY_CAP));
}

export function buildUpdateMailbox(m: Mailbox, s: MailboxSettings): UpdateMailboxRequest | null {
  const patch: UpdateMailboxRequest = {};
  const name = s.displayName.trim();
  if (name && name !== m.displayName) patch.displayName = name;
  const cap = clampCap(s.dailyCap);
  if (cap !== m.dailyCap) patch.dailyCap = cap;
  if (s.signature !== m.signature) patch.signature = s.signature;
  if (s.warm !== m.warm) patch.warm = s.warm;
  if (s.password) patch.password = s.password;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** "12 of 30 today", or what keeps it from sending. */
export function mailboxLoad(m: Pick<Mailbox, 'status' | 'sentToday' | 'capacityToday'>): string {
  if (m.status !== 'active') return MAILBOX_STATUS_LABEL[m.status];
  return `${formatNumber(m.sentToday)} of ${formatNumber(m.sentToday + m.capacityToday)} today`;
}

export function storeMailbox(list: MailboxListResponse | undefined, m: Mailbox): MailboxListResponse | undefined {
  if (!list) return list;
  const known = list.mailboxes.some((x) => x.id === m.id);
  return { ...list, mailboxes: known ? list.mailboxes.map((x) => (x.id === m.id ? m : x)) : [...list.mailboxes, m] };
}

/* The campaign form */

/**
 * The sequence a new campaign starts with: nvoke selling nvoke to B2B
 * founders and agencies. Step 1 names the problem and the offer, step 2 is
 * a short bump with one proof point, step 3 a polite breakup.
 */
export const DEFAULT_STEPS: CampaignStep[] = [
  {
    waitDays: 0,
    brief:
      'Name the problem: finding the right companies and a real person’s verified email takes hours of searching and guessing. Offer nvoke: describe the customers you want in plain words and get the companies with verified emails of named people, ready to export. Tie it to one specific thing from their site. End with one easy question: is finding new clients a priority right now?',
  },
  {
    waitDays: 3,
    brief:
      'A short bump in the same thread, two or three sentences. One concrete proof point: nvoke checks every address with the mail server before it counts, so lists do not bounce, and the first 50 verified emails are free. Ask if it is worth a look.',
  },
  {
    waitDays: 5,
    brief: 'A polite breakup, two sentences. Say this is the last email, leave the door open for later, no guilt and no pressure.',
  },
];

/** What a campaign is sent to, as the source picker holds it. */
export type SourcePick = { kind: 'search'; id: string } | { kind: 'drop'; id: string };

export const pickValue = (p: SourcePick | null): string => (p ? `${p.kind}:${p.id}` : '');

export function parsePick(value: string): SourcePick | null {
  const [kind, id] = value.split(':');
  return (kind === 'search' || kind === 'drop') && id ? { kind, id } : null;
}

/** The searches a campaign can take: finished ones with valid emails, and ongoing ones, newest first. Drop runs come through their drop. */
export function sourceSearches(searches: Search[] | undefined): Search[] {
  return (searches ?? [])
    .filter((s) => s.kind !== 'drop')
    .filter((s) => s.ongoing || (!isActive(s.status) && s.status === 'done' && s.emailsValid > 0))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** An ongoing search or a drop is followed (autopilot); a finished search sends to its leads of now. */
export function sourceFor(pick: SourcePick, searches: Search[] | undefined): CampaignSource {
  if (pick.kind === 'drop') return 'drop';
  return searches?.find((s) => s.id === pick.id)?.ongoing ? 'search' : 'list';
}

export interface CampaignForm {
  name: string;
  pick: SourcePick | null;
  steps: CampaignStep[];
  schedule: CampaignSchedule;
  mailboxIds: string[];
  peopleOnly: boolean;
  allowCatchAll: boolean;
  perCompany: number;
  dailyNew: number;
  holdHours: number;
}

export const DEFAULT_PER_COMPANY = 1;
export const DEFAULT_DAILY_NEW = 30;
export const DEFAULT_HOLD_HOURS = 2;

/** A new campaign's form: every active mailbox, the default sequence and schedule, the source it was opened with. */
export function newCampaignForm(mailboxes: Mailbox[] | undefined, pick: SourcePick | null = null): CampaignForm {
  return {
    name: '',
    pick,
    steps: DEFAULT_STEPS.map((s) => ({ ...s })),
    schedule: { ...DEFAULT_SCHEDULE, days: [...DEFAULT_SCHEDULE.days] },
    mailboxIds: (mailboxes ?? []).filter((m) => m.status === 'active' || m.status === 'checking').map((m) => m.id),
    peopleOnly: true,
    allowCatchAll: false,
    perCompany: DEFAULT_PER_COMPANY,
    dailyNew: DEFAULT_DAILY_NEW,
    holdHours: DEFAULT_HOLD_HOURS,
  };
}

/** An existing campaign's settings as the form edits them. The source stays. */
export function campaignForm(c: Campaign): CampaignForm {
  const pick: SourcePick | null = c.dropId ? { kind: 'drop', id: c.dropId } : c.searchId ? { kind: 'search', id: c.searchId } : null;
  return {
    name: c.name,
    pick,
    steps: c.steps.map((s) => ({ ...s })),
    schedule: { ...c.schedule, days: [...c.schedule.days] },
    mailboxIds: [...c.mailboxIds],
    peopleOnly: c.peopleOnly,
    allowCatchAll: c.allowCatchAll,
    perCompany: c.perCompany,
    dailyNew: c.dailyNew,
    holdHours: c.holdHours,
  };
}

/** Adds a step after the last, 3 days later, until MAX_STEPS. */
export function addStep(steps: CampaignStep[]): CampaignStep[] {
  if (steps.length >= MAX_STEPS) return steps;
  return [...steps, { waitDays: 3, brief: '' }];
}

/** Removes a step; the first step always stays and always goes out at once. */
export function removeStep(steps: CampaignStep[], index: number): CampaignStep[] {
  if (index <= 0 || steps.length <= 1) return steps;
  return steps.filter((_, i) => i !== index);
}

export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);
}

export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** A whole number from `min` to `max`; an empty field (NaN) gives `fallback`. */
const whole = (n: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;

export function campaignFormProblem(form: CampaignForm, editing = false): string | null {
  if (!editing && !form.pick) return 'Pick a search or a drop to send to.';
  if (form.steps.length === 0) return 'A campaign needs at least one email.';
  if (form.steps.some((s) => !s.brief.trim())) return 'Say what each email should do.';
  if (form.steps.slice(1).some((s) => !(s.waitDays >= 1))) return 'A follow up waits at least a day.';
  if (form.schedule.days.length === 0) return 'Pick at least one sending day.';
  if (!(form.schedule.endHour > form.schedule.startHour)) return 'The sending hours end after they start.';
  if (form.mailboxIds.length === 0) return 'Pick at least one mailbox to send from.';
  return null;
}

/** The name a campaign gets when the name is left empty: its source's. */
export function autoCampaignName(pick: SourcePick | null, searches: Search[] | undefined, drops: Drop[] | undefined): string {
  if (pick?.kind === 'drop') return drops?.find((d) => d.id === pick.id)?.name ?? 'Drop campaign';
  const search = pick ? searches?.find((s) => s.id === pick.id) : undefined;
  return search ? searchTitle(search).slice(0, 80) : 'New campaign';
}

function settings(form: CampaignForm) {
  return {
    steps: form.steps.map((s, i) => ({ waitDays: i === 0 ? 0 : whole(s.waitDays, 1, 30, 3), brief: s.brief.trim() })),
    schedule: {
      days: [...new Set(form.schedule.days)].sort((a, b) => a - b),
      startHour: whole(form.schedule.startHour, 0, 23, 9),
      endHour: whole(form.schedule.endHour, 1, 24, 17),
    },
    mailboxIds: form.mailboxIds,
    peopleOnly: form.peopleOnly,
    allowCatchAll: form.allowCatchAll,
    perCompany: whole(form.perCompany, 1, 5, DEFAULT_PER_COMPANY),
    dailyNew: whole(form.dailyNew, 1, 500, DEFAULT_DAILY_NEW),
    holdHours: whole(form.holdHours, 0, 72, DEFAULT_HOLD_HOURS),
  };
}

export function buildCreateCampaign(form: CampaignForm, searches: Search[] | undefined, drops: Drop[] | undefined): CreateCampaignRequest | null {
  if (campaignFormProblem(form) || !form.pick) return null;
  const source = sourceFor(form.pick, searches);
  return {
    name: form.name.trim() || autoCampaignName(form.pick, searches, drops),
    source,
    ...(form.pick.kind === 'drop' ? { dropId: form.pick.id } : { searchId: form.pick.id }),
    ...settings(form),
  };
}

/** The settings that changed, or null when none did. */
export function buildUpdateCampaign(c: Campaign, form: CampaignForm): UpdateCampaignRequest | null {
  if (campaignFormProblem(form, true)) return null;
  const next = { name: form.name.trim() || c.name, ...settings(form) };
  const patch: UpdateCampaignRequest = {};
  if (next.name !== c.name) patch.name = next.name;
  if (JSON.stringify(next.steps) !== JSON.stringify(c.steps.map((s) => ({ waitDays: s.waitDays, brief: s.brief })))) patch.steps = next.steps;
  const sched = { days: [...c.schedule.days].sort((a, b) => a - b), startHour: c.schedule.startHour, endHour: c.schedule.endHour };
  if (JSON.stringify(next.schedule) !== JSON.stringify(sched)) patch.schedule = next.schedule;
  if ([...next.mailboxIds].sort().join() !== [...c.mailboxIds].sort().join()) patch.mailboxIds = next.mailboxIds;
  if (next.peopleOnly !== c.peopleOnly) patch.peopleOnly = next.peopleOnly;
  if (next.allowCatchAll !== c.allowCatchAll) patch.allowCatchAll = next.allowCatchAll;
  if (next.perCompany !== c.perCompany) patch.perCompany = next.perCompany;
  if (next.dailyNew !== c.dailyNew) patch.dailyNew = next.dailyNew;
  if (next.holdHours !== c.holdHours) patch.holdHours = next.holdHours;
  return Object.keys(patch).length > 0 ? patch : null;
}

export function storeCampaign(list: CampaignListResponse | undefined, c: Campaign): CampaignListResponse | undefined {
  if (!list) return list;
  const known = list.campaigns.some((x) => x.id === c.id);
  return { ...list, campaigns: known ? list.campaigns.map((x) => (x.id === c.id ? c : x)) : [c, ...list.campaigns] };
}

/** A reply's first lines for the inbox row, quoted history cut off. */
export function replySnippet(body: string | null, max = 160): string {
  if (!body) return '';
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*>/.test(line) || /^On .+ wrote:\s*$/.test(line.trim())) break;
    if (line.trim()) lines.push(line.trim());
  }
  const text = lines.join(' ');
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
