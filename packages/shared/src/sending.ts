import { z } from 'zod';

/**
 * Sending (docs/sending/plan.md): mailboxes the user connects, campaigns
 * that write a short sequence per lead and send it from those mailboxes in
 * the recipients' working hours, and the replies that come back. An
 * autopilot campaign follows an ongoing search or a drop and enrolls every
 * new valid lead after one start.
 */

export const DEFAULT_DAILY_CAP = 30;
export const MAX_DAILY_CAP = 50;
export const MAX_STEPS = 4;
/** The review window after Start before the first send. */
export const REVIEW_MINUTES = 60;
/** Recipients in these countries are never sent to: their law needs prior consent, B2B included. */
export const BLOCKED_COUNTRIES = ['DK', 'DE'] as const;
export const MAX_MAILBOXES = 20;
export const MAX_CAMPAIGNS = 50;

const datetime = z.iso.datetime({ offset: true });

export const MailboxProvider = z.enum(['smtp', 'google', 'microsoft']);
export type MailboxProvider = z.infer<typeof MailboxProvider>;

export const MailboxStatus = z.enum(['checking', 'active', 'paused', 'error', 'disconnected']);
export type MailboxStatus = z.infer<typeof MailboxStatus>;

export const Mailbox = z.object({
  id: z.uuid(),
  address: z.email(),
  displayName: z.string(),
  provider: MailboxProvider,
  smtpHost: z.string(),
  smtpPort: z.number().int(),
  imapHost: z.string(),
  imapPort: z.number().int(),
  username: z.string(),
  dailyCap: z.number().int(),
  warm: z.boolean(),
  status: MailboxStatus,
  /** Why it is not active, in words the user can act on. */
  statusReason: z.string().nullable(),
  signature: z.string(),
  /** Sends left today after the cap, the ramp and what already went. */
  capacityToday: z.number().int().nonnegative(),
  sentToday: z.number().int().nonnegative(),
  lastSendAt: datetime.nullable(),
  lastPollAt: datetime.nullable(),
  createdAt: datetime,
});
export type Mailbox = z.infer<typeof Mailbox>;

const host = z.string().trim().min(1).max(253);

/** SMTP submission ports a mailbox may use: TLS from the start on 465, STARTTLS on 587 and 2525. */
export const SMTP_PORTS: readonly number[] = [465, 587, 2525];
/** IMAP ports a mailbox may use: TLS on 993, STARTTLS on 143. */
export const IMAP_PORTS: readonly number[] = [993, 143];
const oneOf = (ports: readonly number[]) =>
  z.number().int().refine((p) => ports.includes(p), { message: `port must be ${ports.join(', ')}` });

export const ConnectMailboxRequest = z.object({
  address: z.email().transform((v) => v.toLowerCase()),
  displayName: z.string().trim().min(1).max(80),
  smtpHost: host,
  smtpPort: oneOf(SMTP_PORTS),
  imapHost: host,
  imapPort: oneOf(IMAP_PORTS),
  /** The address when left out. */
  username: z.string().trim().min(1).max(254).optional(),
  password: z.string().min(1).max(1024),
  /** true for a mailbox that already sends every day: no ramp up. */
  warm: z.boolean().optional(),
  dailyCap: z.number().int().min(1).max(MAX_DAILY_CAP).optional(),
  signature: z.string().max(1000).optional(),
});
export type ConnectMailboxRequest = z.infer<typeof ConnectMailboxRequest>;

export const UpdateMailboxRequest = z
  .object({
    displayName: z.string().trim().min(1).max(80).optional(),
    dailyCap: z.number().int().min(1).max(MAX_DAILY_CAP).optional(),
    signature: z.string().max(1000).optional(),
    warm: z.boolean().optional(),
    /** A new password reconnects the mailbox and checks it again. */
    password: z.string().min(1).max(1024).optional(),
    status: z.enum(['active', 'paused']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type UpdateMailboxRequest = z.infer<typeof UpdateMailboxRequest>;

/** Sign in with Microsoft: where to send the browser. The state in it is bound to the user. */
export const MailboxOAuthStartResponse = z.object({ url: z.url() });
export type MailboxOAuthStartResponse = z.infer<typeof MailboxOAuthStartResponse>;

/** The callback page posts what Microsoft sent back. */
export const MailboxOAuthCallbackRequest = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(200),
});
export type MailboxOAuthCallbackRequest = z.infer<typeof MailboxOAuthCallbackRequest>;

export const MailboxListResponse = z.object({ mailboxes: z.array(Mailbox) });
export type MailboxListResponse = z.infer<typeof MailboxListResponse>;

/** Known providers, so the connect form fills host and port from the address's domain or MX. */
export const MailboxPreset = z.object({
  key: z.string(),
  label: z.string(),
  smtpHost: z.string(),
  smtpPort: z.number().int(),
  imapHost: z.string(),
  imapPort: z.number().int(),
  /** Where to make an app password, shown in the form. */
  help: z.string(),
});
export type MailboxPreset = z.infer<typeof MailboxPreset>;

export const MAILBOX_PRESETS: MailboxPreset[] = [
  { key: 'google', label: 'Google Workspace or Gmail', smtpHost: 'smtp.gmail.com', smtpPort: 465, imapHost: 'imap.gmail.com', imapPort: 993, help: 'Turn on 2-Step Verification, then make an app password at myaccount.google.com/apppasswords.' },
  { key: 'microsoft', label: 'Microsoft 365 or Outlook', smtpHost: 'smtp.office365.com', smtpPort: 587, imapHost: 'outlook.office365.com', imapPort: 993, help: 'Use Sign in with Microsoft above: Microsoft no longer takes passwords over SMTP and IMAP.' },
  { key: 'zoho', label: 'Zoho Mail (own domain)', smtpHost: 'smtppro.zoho.eu', smtpPort: 465, imapHost: 'imappro.zoho.eu', imapPort: 993, help: 'Turn on IMAP Access under Settings, Mail accounts, then make an app password at accounts.zoho.eu under Security. Outside the EU use smtppro.zoho.com and imappro.zoho.com.' },
  { key: 'zoho-personal', label: 'Zoho Mail (@zoho address)', smtpHost: 'smtp.zoho.eu', smtpPort: 465, imapHost: 'imap.zoho.eu', imapPort: 993, help: 'Turn on IMAP Access under Settings, Mail accounts, then make an app password at accounts.zoho.eu under Security. Outside the EU use smtp.zoho.com and imap.zoho.com.' },
  { key: 'fastmail', label: 'Fastmail', smtpHost: 'smtp.fastmail.com', smtpPort: 465, imapHost: 'imap.fastmail.com', imapPort: 993, help: 'Make an app password under Settings, Privacy and Security.' },
  { key: 'icloud', label: 'iCloud Mail', smtpHost: 'smtp.mail.me.com', smtpPort: 587, imapHost: 'imap.mail.me.com', imapPort: 993, help: 'Make an app-specific password at account.apple.com.' },
  { key: 'namecheap', label: 'Namecheap Private Email', smtpHost: 'mail.privateemail.com', smtpPort: 465, imapHost: 'mail.privateemail.com', imapPort: 993, help: 'Use the mailbox password.' },
  { key: 'other', label: 'Other', smtpHost: '', smtpPort: 587, imapHost: '', imapPort: 993, help: 'Your provider lists its SMTP and IMAP servers in its help pages.' },
];

/** A sequence step: how many days after the previous one, and what it should say. */
export const CampaignStep = z.object({
  waitDays: z.number().int().min(0).max(30),
  /** What this email should do, in the user's words. Claude writes it per lead from this. */
  brief: z.string().trim().min(1).max(1000),
});
export type CampaignStep = z.infer<typeof CampaignStep>;

export const CampaignSchedule = z.object({
  /** ISO weekdays, 1 is Monday. */
  days: z.array(z.number().int().min(1).max(7)).min(1),
  startHour: z.number().int().min(0).max(23),
  endHour: z.number().int().min(1).max(24),
}).refine((s) => s.endHour > s.startHour, { message: 'endHour must be after startHour' });
export type CampaignSchedule = z.infer<typeof CampaignSchedule>;

export const DEFAULT_SCHEDULE: CampaignSchedule = { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };

export const CampaignStatus = z.enum(['draft', 'writing', 'review', 'scheduled', 'sending', 'paused', 'done', 'canceled']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

export const CampaignSource = z.enum(['list', 'search', 'drop']);
export type CampaignSource = z.infer<typeof CampaignSource>;

/**
 * What a campaign sells, when it is not the account's own site (the owner's
 * other products, Day3 and exit1). Set, it replaces the site profile and
 * nvoke's prices in the write prompt, names the signature's site, and
 * scopes the campaign's opt-outs to `domain`.
 */
export const CampaignProduct = z.object({
  name: z.string().trim().min(1).max(60),
  /** The product's site, lowercase, e.g. "day3.app". Opt-outs from this campaign hold for this sender. */
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((d) => d.replace(/^www\./, ''))
    .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'a bare domain such as day3.app')),
  /** What it is, in a sentence or two. */
  summary: z.string().trim().min(1).max(600),
  /** What a recipient gets, and the free part. */
  offer: z.string().trim().min(1).max(600),
  /** Who it is for. */
  audience: z.string().trim().min(1).max(400),
  /** The real prices, in plain words. Claude may work one number out of these and of nothing else. */
  prices: z.string().trim().min(1).max(1500),
  /** The angle: why these recipients, why now. */
  pitch: z.string().trim().min(1).max(1500),
  proof: z.array(z.string().trim().min(1).max(200)).max(6).default([]),
  /**
   * A fact to check again just before each send. `ssl`: the certificate
   * problem the lead was found for must still be there on the lead's
   * domain; once it is fixed the lead stops with skip_reason `resolved`.
   */
  recheck: z.enum(['ssl']).nullable().default(null),
});
export type CampaignProduct = z.infer<typeof CampaignProduct>;

export const Campaign = z.object({
  id: z.uuid(),
  name: z.string(),
  status: CampaignStatus,
  source: CampaignSource,
  searchId: z.uuid().nullable(),
  dropId: z.uuid().nullable(),
  autopilot: z.boolean(),
  peopleOnly: z.boolean(),
  allowCatchAll: z.boolean(),
  perCompany: z.number().int(),
  dailyNew: z.number().int(),
  holdHours: z.number().int(),
  steps: z.array(CampaignStep),
  schedule: CampaignSchedule,
  /** Null: the account's own site and, for nvoke, its plans. */
  product: CampaignProduct.nullable(),
  mailboxIds: z.array(z.uuid()),
  reviewUntil: datetime.nullable(),
  leads: z.number().int().nonnegative(),
  sent: z.number().int().nonnegative(),
  replied: z.number().int().nonnegative(),
  bounced: z.number().int().nonnegative(),
  optedOut: z.number().int().nonnegative(),
  /** Leads Claude is still writing for. */
  writing: z.number().int().nonnegative(),
  /** Leads skipped at enroll, by reason (`country`, `suppressed`, `not_valid`, `contacted`, ...). */
  skipped: z.record(z.string(), z.number().int().nonnegative()),
  createdAt: datetime,
  startedAt: datetime.nullable(),
  finishedAt: datetime.nullable(),
});
export type Campaign = z.infer<typeof Campaign>;

const steps = z.array(CampaignStep).min(1).max(MAX_STEPS).refine((s) => s[0]?.waitDays === 0, { message: 'the first step goes out at once (waitDays 0)' });

export const CreateCampaignRequest = z
  .object({
    name: z.string().trim().min(1).max(80),
    /** list: `searchId` (its valid leads now) or `emailIds`. search: follows `searchId`. drop: follows `dropId`. */
    source: CampaignSource.default('list'),
    searchId: z.uuid().optional(),
    dropId: z.uuid().optional(),
    emailIds: z.array(z.uuid()).min(1).max(5_000).optional(),
    steps,
    schedule: CampaignSchedule.optional(),
    mailboxIds: z.array(z.uuid()).min(1).max(MAX_MAILBOXES),
    peopleOnly: z.boolean().optional(),
    allowCatchAll: z.boolean().optional(),
    perCompany: z.number().int().min(1).max(5).optional(),
    dailyNew: z.number().int().min(1).max(500).optional(),
    holdHours: z.number().int().min(0).max(72).optional(),
    product: CampaignProduct.optional(),
  })
  .refine((v) => v.source !== 'search' || v.searchId, { message: 'source search needs searchId', path: ['searchId'] })
  .refine((v) => v.source !== 'drop' || v.dropId, { message: 'source drop needs dropId', path: ['dropId'] })
  .refine((v) => v.source !== 'list' || v.searchId || v.emailIds, { message: 'a list campaign needs searchId or emailIds', path: ['searchId'] });
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequest>;

export const UpdateCampaignRequest = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    /** Changes apply to leads written from now on; written emails stay. */
    steps: steps.optional(),
    schedule: CampaignSchedule.optional(),
    mailboxIds: z.array(z.uuid()).min(1).max(MAX_MAILBOXES).optional(),
    peopleOnly: z.boolean().optional(),
    allowCatchAll: z.boolean().optional(),
    perCompany: z.number().int().min(1).max(5).optional(),
    dailyNew: z.number().int().min(1).max(500).optional(),
    holdHours: z.number().int().min(0).max(72).optional(),
    /** Null goes back to the account's own site. */
    product: CampaignProduct.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequest>;

export const CampaignListResponse = z.object({ campaigns: z.array(Campaign) });
export type CampaignListResponse = z.infer<typeof CampaignListResponse>;

export const CampaignLeadStatus = z.enum(['writing', 'queued', 'active', 'replied', 'bounced', 'opted_out', 'failed', 'done', 'skipped', 'stopped']);
export type CampaignLeadStatus = z.infer<typeof CampaignLeadStatus>;

export const WrittenStep = z.object({
  step: z.number().int().min(1).max(MAX_STEPS),
  subject: z.string(),
  body: z.string(),
  edited: z.boolean(),
  /** When it went out, null until then. */
  sentAt: datetime.nullable(),
});
export type WrittenStep = z.infer<typeof WrittenStep>;

export const CampaignLead = z.object({
  id: z.uuid(),
  address: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  title: z.string().nullable(),
  companyName: z.string(),
  domain: z.string(),
  country: z.string().nullable(),
  timezone: z.string(),
  mailboxId: z.uuid().nullable(),
  status: CampaignLeadStatus,
  skipReason: z.string().nullable(),
  nextStep: z.number().int(),
  nextSendAt: datetime.nullable(),
  createdAt: datetime,
});
export type CampaignLead = z.infer<typeof CampaignLead>;

export const CampaignLeadListResponse = z.object({
  leads: z.array(CampaignLead),
  nextCursor: z.string().nullable(),
});
export type CampaignLeadListResponse = z.infer<typeof CampaignLeadListResponse>;

export const MessageDirection = z.enum(['out', 'in']);
export const MessageKind = z.enum(['step', 'reply', 'auto_reply', 'bounce', 'other']);
export type MessageKind = z.infer<typeof MessageKind>;

export const Message = z.object({
  id: z.uuid(),
  mailboxId: z.uuid().nullable(),
  campaignId: z.uuid().nullable(),
  campaignLeadId: z.uuid().nullable(),
  direction: MessageDirection,
  kind: MessageKind,
  subject: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  /** Replies only. */
  bodyText: z.string().nullable(),
  step: z.number().int().nullable(),
  readAt: datetime.nullable(),
  at: datetime,
});
export type Message = z.infer<typeof Message>;

export const CampaignLeadDetail = z.object({
  lead: CampaignLead,
  steps: z.array(WrittenStep),
  messages: z.array(Message),
});
export type CampaignLeadDetail = z.infer<typeof CampaignLeadDetail>;

export const UpdateWrittenStepRequest = z
  .object({
    subject: z.string().trim().min(1).max(200).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing to update' });
export type UpdateWrittenStepRequest = z.infer<typeof UpdateWrittenStepRequest>;

export const Reply = Message.extend({
  campaignName: z.string().nullable(),
  leadName: z.string().nullable(),
  companyName: z.string().nullable(),
});
export type Reply = z.infer<typeof Reply>;

export const ReplyListResponse = z.object({
  replies: z.array(Reply),
  nextCursor: z.string().nullable(),
});
export type ReplyListResponse = z.infer<typeof ReplyListResponse>;

export const SendingSummary = z.object({
  /** False when the server has no SECRETS_KEY or sending is switched off. */
  available: z.boolean(),
  period: z.string(),
  sentThisPeriod: z.number().int().nonnegative(),
  mailboxesActive: z.number().int().nonnegative(),
  /** Sends left today across active mailboxes. */
  capacityToday: z.number().int().nonnegative(),
  repliesUnread: z.number().int().nonnegative(),
});
export type SendingSummary = z.infer<typeof SendingSummary>;

export const SendingIdParams = z.object({ id: z.uuid() });
export type SendingIdParams = z.infer<typeof SendingIdParams>;

export const CampaignLeadParams = z.object({ id: z.uuid(), leadId: z.uuid() });
export type CampaignLeadParams = z.infer<typeof CampaignLeadParams>;

export const CampaignStepParams = z.object({ id: z.uuid(), leadId: z.uuid(), step: z.coerce.number().int().min(1).max(MAX_STEPS) });
export type CampaignStepParams = z.infer<typeof CampaignStepParams>;

export const CampaignLeadsQuery = z.object({
  status: CampaignLeadStatus.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CampaignLeadsQuery = z.infer<typeof CampaignLeadsQuery>;

export const ReplyListQuery = z.object({
  /** `true`: only replies nobody opened yet. */
  unread: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ReplyListQuery = z.infer<typeof ReplyListQuery>;
