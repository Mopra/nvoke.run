import { describe, expect, it } from 'vitest';
import { MAX_STEPS, type Campaign, type Drop, type Mailbox, type Search } from '@nvoke/shared';
import { ApiError } from './api';
import {
  addStep,
  applyPreset,
  buildConnectMailbox,
  buildCreateCampaign,
  buildUpdateCampaign,
  buildUpdateMailbox,
  campaignForm,
  campaignFormProblem,
  campaignNote,
  campaignPath,
  campaignPollInterval,
  campaignsPollInterval,
  CHECKING_POLL_MS,
  DEFAULT_STEPS,
  emptyMailboxForm,
  isNotInternal,
  mailboxesPollInterval,
  mailboxFormProblem,
  mailboxLoad,
  mailboxSettings,
  newCampaignForm,
  parsePick,
  pickValue,
  presetForAddress,
  removeStep,
  REPLIES_POLL_MS,
  retrySendingSummary,
  replySnippet,
  scheduleLabel,
  sendingAccess,
  sendingSummaryPollInterval,
  SENDING_POLL_MS,
  sendingError,
  skippedLines,
  skippedTotal,
  sourceFor,
  sourceSearches,
  storeCampaign,
  toggleDay,
  withAddress,
  WRITING_POLL_MS,
} from './sending';

const NOW = Date.parse('2026-10-20T10:00:00Z');

const campaign = (over: Partial<Campaign> = {}): Campaign => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Agencies',
  status: 'review',
  source: 'search',
  searchId: '22222222-2222-4222-8222-222222222222',
  dropId: null,
  autopilot: true,
  peopleOnly: true,
  allowCatchAll: false,
  perCompany: 1,
  dailyNew: 30,
  holdHours: 2,
  steps: DEFAULT_STEPS,
  schedule: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 },
  product: null,
  mailboxIds: ['33333333-3333-4333-8333-333333333333'],
  reviewUntil: null,
  leads: 10,
  sent: 0,
  replied: 0,
  bounced: 0,
  optedOut: 0,
  writing: 0,
  skipped: {},
  createdAt: '2026-10-20T09:00:00Z',
  startedAt: null,
  finishedAt: null,
  ...over,
});

const mailbox = (over: Partial<Mailbox> = {}): Mailbox => ({
  id: '33333333-3333-4333-8333-333333333333',
  address: 'me@acme.com',
  displayName: 'Morten',
  provider: 'smtp',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 465,
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  username: 'me@acme.com',
  dailyCap: 30,
  warm: true,
  status: 'active',
  statusReason: null,
  signature: '',
  capacityToday: 18,
  sentToday: 12,
  lastSendAt: null,
  lastPollAt: null,
  createdAt: '2026-10-19T09:00:00Z',
  ...over,
});

const search = (id: string, over: Record<string, unknown> = {}): Search =>
  ({
    id,
    kind: 'local',
    status: 'done',
    emailsValid: 5,
    ongoing: false,
    createdAt: '2026-10-19T00:00:00Z',
    params: { niche: 'agencies', location: 'London' },
    ...over,
  }) as unknown as Search;

describe('polling', () => {
  it('polls fast while writing, slowly while sending, never when waiting or ended', () => {
    expect(campaignPollInterval(campaign({ status: 'writing' }))).toBe(WRITING_POLL_MS);
    expect(campaignPollInterval(campaign({ status: 'draft' }))).toBe(WRITING_POLL_MS);
    expect(campaignPollInterval(campaign({ status: 'sending' }))).toBe(SENDING_POLL_MS);
    expect(campaignPollInterval(campaign({ status: 'scheduled' }))).toBe(SENDING_POLL_MS);
    expect(campaignPollInterval(campaign({ status: 'sending', writing: 3 }))).toBe(WRITING_POLL_MS);
    for (const status of ['review', 'paused', 'done', 'canceled'] as const) expect(campaignPollInterval(campaign({ status }))).toBe(false);
    expect(campaignPollInterval(undefined)).toBe(false);
  });

  it('polls the list at its fastest campaign', () => {
    expect(campaignsPollInterval({ campaigns: [campaign({ status: 'sending' }), campaign({ status: 'writing' })] })).toBe(WRITING_POLL_MS);
    expect(campaignsPollInterval({ campaigns: [campaign({ status: 'done' })] })).toBe(false);
    expect(campaignsPollInterval(undefined)).toBe(false);
  });

  it('polls mailboxes only while one is checked', () => {
    expect(mailboxesPollInterval({ mailboxes: [mailbox({ status: 'checking' })] })).toBe(CHECKING_POLL_MS);
    expect(mailboxesPollInterval({ mailboxes: [mailbox()] })).toBe(false);
  });
});

describe('readings', () => {
  it('builds the campaign path with an optional lead', () => {
    expect(campaignPath('abc')).toBe('/app/campaigns/abc');
    expect(campaignPath('abc', 'l 1')).toBe('/app/campaigns/abc?lead=l%201');
  });

  it('says when the first send can be after Start, and the review hour after it', () => {
    expect(campaignNote(campaign(), NOW, 'UTC')).toBe('Start, then the first email goes out no earlier than 11:00');
    expect(campaignNote(campaign({ status: 'scheduled', reviewUntil: '2026-10-20T10:45:00Z' }), NOW, 'UTC')).toBe(
      'Review until 10:45, then sending in working hours',
    );
    expect(campaignNote(campaign({ status: 'sending' }), NOW, 'UTC')).toBe('New leads are written and sent 2 h later');
    expect(campaignNote(campaign({ status: 'writing', writing: 4 }), NOW)).toBe('Claude is writing 4 leads');
  });

  it('labels a schedule as a run of days or a list', () => {
    expect(scheduleLabel({ days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 })).toBe('Mon to Fri, 9 to 17');
    expect(scheduleLabel({ days: [5, 1, 3], startHour: 8, endHour: 12 })).toBe('Mon, Wed, Fri, 8 to 12');
  });

  it('lists skipped reasons biggest first and counts them', () => {
    const skipped = { country: 2, not_valid: 5, contacted: 0 };
    expect(skippedLines(skipped).map((l) => l.reason)).toEqual(['not_valid', 'country']);
    expect(skippedLines({ odd_reason: 1 })[0]?.label).toBe('odd reason');
    expect(skippedTotal(skipped)).toBe(7);
  });

  it('shows a mailbox’s sends against what it may send today', () => {
    expect(mailboxLoad(mailbox())).toBe('12 of 30 today');
    expect(mailboxLoad(mailbox({ status: 'error' }))).toBe('Needs attention');
  });

  it('cuts a reply at the quoted history', () => {
    expect(replySnippet('Sounds good.\nCall me Monday.\n\nOn Mon, 19 Oct 2026, Morten wrote:\n> Hi')).toBe('Sounds good. Call me Monday.');
    expect(replySnippet('x'.repeat(200), 20)).toHaveLength(20);
    expect(replySnippet(null)).toBe('');
  });

  it('words the sending codes', () => {
    expect(sendingError(new ApiError(503, 'sending_unavailable'))).toBe('Sending is switched off on this server.');
    expect(sendingError(new ApiError(400, 'no_leads'))).toMatch(/no verified leads/);
    expect(sendingError(new Error('boom'))).toBe('boom');
  });
});

describe('the mailbox form', () => {
  it('fills the servers from a known address and keeps them for a custom domain', () => {
    expect(presetForAddress('Someone@Outlook.com')?.key).toBe('microsoft');
    expect(presetForAddress('me@acme.com')).toBeNull();
    const form = withAddress(emptyMailboxForm(), 'me@icloud.com');
    expect(form.preset).toBe('icloud');
    expect(form.smtpHost).toBe('smtp.mail.me.com');
    const custom = withAddress(form, 'me@acme.com');
    expect(custom.smtpHost).toBe('smtp.mail.me.com');
  });

  it('keeps typed servers when Other is picked', () => {
    const typed = { ...emptyMailboxForm(), smtpHost: 'mail.acme.com' };
    expect(applyPreset(typed, 'other').smtpHost).toBe('mail.acme.com');
    expect(applyPreset(typed, 'fastmail').smtpHost).toBe('smtp.fastmail.com');
  });

  it('needs the address, the name, the servers and the password, and leaves the username out when it is the address', () => {
    const form = { ...emptyMailboxForm(), address: 'Me@Acme.com ', displayName: 'Morten', password: 'app pass', username: 'me@acme.com' };
    expect(mailboxFormProblem({ ...form, password: '' })).toMatch(/password/);
    expect(mailboxFormProblem({ ...form, address: 'nope' })).toMatch(/address/);
    expect(mailboxFormProblem({ ...form, smtpPort: 0 })).toMatch(/port/);
    const req = buildConnectMailbox(form);
    expect(req).toMatchObject({ address: 'me@acme.com', displayName: 'Morten', smtpHost: 'smtp.gmail.com', smtpPort: 465, warm: true });
    expect(req).not.toHaveProperty('username');
    expect(buildConnectMailbox({ ...form, username: 'other' })?.username).toBe('other');
  });

  it('sends only the changed settings, and a new password', () => {
    const m = mailbox();
    expect(buildUpdateMailbox(m, mailboxSettings(m))).toBeNull();
    expect(buildUpdateMailbox(m, { ...mailboxSettings(m), dailyCap: 99, signature: 'Morten\nnvoke' })).toEqual({ dailyCap: 50, signature: 'Morten\nnvoke' });
    expect(buildUpdateMailbox(m, { ...mailboxSettings(m), password: 'new' })).toEqual({ password: 'new' });
  });
});

describe('the campaign form', () => {
  const searches = [
    search('done'),
    search('ongoing', { ongoing: true, emailsValid: 0 }),
    search('empty', { emailsValid: 0 }),
    search('running', { status: 'running' }),
    search('run', { kind: 'drop' }),
  ];
  const drops = [{ id: 'd1', name: 'AI launches' }] as Drop[];

  it('offers finished searches with valid emails and ongoing ones', () => {
    expect(sourceSearches(searches).map((s) => s.id)).toEqual(['done', 'ongoing']);
  });

  it('follows an ongoing search and a drop, and sends a finished search as a list', () => {
    expect(sourceFor({ kind: 'search', id: 'ongoing' }, searches)).toBe('search');
    expect(sourceFor({ kind: 'search', id: 'done' }, searches)).toBe('list');
    expect(sourceFor({ kind: 'drop', id: 'd1' }, searches)).toBe('drop');
  });

  it('round trips the picker value', () => {
    expect(parsePick(pickValue({ kind: 'drop', id: 'd1' }))).toEqual({ kind: 'drop', id: 'd1' });
    expect(parsePick('')).toBeNull();
    expect(parsePick('other:x')).toBeNull();
  });

  it('starts with the three step sequence and every usable mailbox', () => {
    const form = newCampaignForm([mailbox(), mailbox({ id: 'x', status: 'paused' })]);
    expect(form.steps.map((s) => s.waitDays)).toEqual([0, 3, 5]);
    expect(form.mailboxIds).toEqual([mailbox().id]);
    expect(form.peopleOnly).toBe(true);
  });

  it('adds steps up to the most and never removes the first', () => {
    let steps = DEFAULT_STEPS;
    for (let i = 0; i < 5; i++) steps = addStep(steps);
    expect(steps).toHaveLength(MAX_STEPS);
    expect(removeStep(steps, 0)).toHaveLength(MAX_STEPS);
    expect(removeStep(steps, 1)).toHaveLength(MAX_STEPS - 1);
  });

  it('says what is missing', () => {
    const form = newCampaignForm([mailbox()]);
    expect(campaignFormProblem(form)).toMatch(/Pick a search/);
    const picked = { ...form, pick: { kind: 'search', id: 'done' } as const };
    expect(campaignFormProblem(picked)).toBeNull();
    expect(campaignFormProblem({ ...picked, mailboxIds: [] })).toMatch(/mailbox/);
    expect(campaignFormProblem({ ...picked, schedule: { ...picked.schedule, days: [] } })).toMatch(/day/);
    expect(campaignFormProblem({ ...picked, schedule: { days: [1], startHour: 17, endHour: 9 } })).toMatch(/hours/);
    expect(campaignFormProblem({ ...picked, steps: [...picked.steps.slice(0, 2), { waitDays: 0, brief: 'x' }] })).toMatch(/a day/);
    expect(campaignFormProblem({ ...picked, steps: [{ waitDays: 0, brief: ' ' }] })).toMatch(/each email/);
  });

  it('builds the request with the source and a name from it', () => {
    const form = { ...newCampaignForm([mailbox()]), pick: { kind: 'search', id: 'ongoing' } as const };
    expect(toggleDay([1, 2], 2)).toEqual([1]);
    expect(toggleDay([3, 1], 2)).toEqual([1, 2, 3]);
    const req = buildCreateCampaign(form, searches, drops);
    expect(req).toMatchObject({ source: 'search', searchId: 'ongoing', perCompany: 1, dailyNew: 30, holdHours: 2 });
    expect(req?.name).toBe('Agencies in London');
    expect(req?.steps[0]?.waitDays).toBe(0);
    const dropReq = buildCreateCampaign({ ...form, pick: { kind: 'drop', id: 'd1' } }, searches, drops);
    expect(dropReq).toMatchObject({ source: 'drop', dropId: 'd1', name: 'AI launches' });
    expect(dropReq).not.toHaveProperty('searchId');
  });

  it('sends only the settings that changed', () => {
    const c = campaign();
    const form = campaignForm(c);
    expect(buildUpdateCampaign(c, form)).toBeNull();
    expect(buildUpdateCampaign(c, { ...form, holdHours: 4, schedule: { ...form.schedule, days: [1, 3] } })).toEqual({
      holdHours: 4,
      schedule: { days: [1, 3], startHour: 9, endHour: 17 },
    });
  });

  it('stores a changed campaign in place or first', () => {
    const list = { campaigns: [campaign()] };
    expect(storeCampaign(list, campaign({ name: 'B' }))?.campaigns.map((c) => c.name)).toEqual(['B']);
    expect(storeCampaign(list, campaign({ id: 'x' }))?.campaigns).toHaveLength(2);
    expect(storeCampaign(undefined, campaign())).toBeUndefined();
  });
});

describe('who sees sending', () => {
  const summary = { repliesUnread: 2 };
  const notInternal = new ApiError(404, 'not_found');

  it('shows sending only once GET /v1/sending answered 200', () => {
    expect(sendingAccess({ data: summary })).toBe('internal');
    expect(sendingAccess({})).toBe('checking');
  });

  it('hides it on a 404, even over a cached 200', () => {
    expect(sendingAccess({ error: notInternal })).toBe('hidden');
    expect(sendingAccess({ data: summary, error: notInternal })).toBe('hidden');
    expect(isNotInternal(notInternal)).toBe(true);
    expect(isNotInternal(new ApiError(503, 'sending_unavailable'))).toBe(false);
  });

  it('keeps a cached 200 through other failures, and shows none without one', () => {
    expect(sendingAccess({ data: summary, error: new ApiError(0, 'network') })).toBe('internal');
    expect(sendingAccess({ error: new ApiError(500, 'internal') })).toBe('error');
    expect(sendingAccess({ error: new ApiError(503, 'sending_unavailable') })).toBe('error');
  });

  it('never polls or retries after a 404', () => {
    expect(sendingSummaryPollInterval(notInternal)).toBe(false);
    expect(sendingSummaryPollInterval(null)).toBe(REPLIES_POLL_MS);
    expect(sendingSummaryPollInterval(new ApiError(0, 'network'))).toBe(REPLIES_POLL_MS);
    expect(retrySendingSummary(0, notInternal)).toBe(false);
    expect(retrySendingSummary(0, new ApiError(503, 'sending_unavailable'))).toBe(false);
    expect(retrySendingSummary(0, new ApiError(0, 'network'))).toBe(true);
    expect(retrySendingSummary(2, new ApiError(0, 'network'))).toBe(false);
  });
});
