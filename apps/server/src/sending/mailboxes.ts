// Mailboxes the user connects (docs/sending/plan.md, "Step 1"): connect,
// check, edit, delete, and the list with today's capacity. The password is
// sealed with SECRETS_KEY before it reaches the table and only opened here,
// for the transport. Every query is scoped by clerk_user_id.

import { MAX_MAILBOXES, type ConnectMailboxRequest, type Mailbox, type UpdateMailboxRequest } from '@nvoke/shared';
import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { SecretsError, type Secrets } from '../crypto/secrets.js';
import { mailboxCapacity } from './schedule.js';
import type { CheckResult, MailboxCredentials, TransportFactory } from './types.js';

export interface MailboxDeps {
  sql: Sql;
  secrets: Secrets;
  transport: TransportFactory;
  log: Logger;
}

export class MailboxError extends Error {
  constructor(
    readonly code: 'too_many_mailboxes' | 'exists' | 'not_found',
    message: string,
  ) {
    super(message);
  }
}

/** A mailboxes row as postgres.js returns it. */
export interface MailboxRow {
  id: string;
  clerk_user_id: string;
  address: string;
  display_name: string;
  provider: 'smtp' | 'google' | 'microsoft';
  source: 'connected' | 'provided';
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  username: string;
  secret: string;
  daily_cap: number;
  warm: boolean;
  ramp_started_at: Date;
  status: Mailbox['status'];
  status_reason: string | null;
  signature: string;
  last_send_at: Date | null;
  last_poll_at: Date | null;
  poll_state: Record<string, { uidValidity: number; lastUid: number }>;
  created_at: Date;
}

/** Opens the sealed password. Throws SecretsError when SECRETS_KEY changed. */
export function credentialsFor(secrets: Secrets, row: MailboxRow): MailboxCredentials {
  return {
    address: row.address,
    displayName: row.display_name,
    smtpHost: row.smtp_host,
    smtpPort: row.smtp_port,
    smtpSecure: row.smtp_secure,
    imapHost: row.imap_host,
    imapPort: row.imap_port,
    username: row.username,
    password: secrets.open(row.secret),
  };
}

type RowWithSent = MailboxRow & { sent_today: number };

function toMailbox(r: RowWithSent, now: Date): Mailbox {
  return {
    id: r.id,
    address: r.address,
    displayName: r.display_name,
    provider: r.provider,
    smtpHost: r.smtp_host,
    smtpPort: r.smtp_port,
    imapHost: r.imap_host,
    imapPort: r.imap_port,
    username: r.username,
    dailyCap: r.daily_cap,
    warm: r.warm,
    status: r.status,
    statusReason: r.status_reason,
    signature: r.signature,
    capacityToday: mailboxCapacity({ dailyCap: r.daily_cap, warm: r.warm, rampStartedAt: r.ramp_started_at }, r.sent_today, now),
    sentToday: r.sent_today,
    lastSendAt: r.last_send_at?.toISOString() ?? null,
    lastPollAt: r.last_poll_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
  };
}

const DAY_MS = 86_400_000;

async function selectMailboxes(sql: Sql, userId: string, now: Date, id?: string): Promise<RowWithSent[]> {
  const since = new Date(now.getTime() - DAY_MS);
  return sql<RowWithSent[]>`
    select m.*,
      (select count(*)::int from messages g
        where g.mailbox_id = m.id and g.direction = 'out' and g.at > ${since}) as sent_today
    from mailboxes m
    where m.clerk_user_id = ${userId} ${id ? sql`and m.id = ${id}` : sql``}
    order by m.created_at, m.id
  `;
}

export async function listMailboxes(sql: Sql, userId: string, now: Date = new Date()): Promise<Mailbox[]> {
  return (await selectMailboxes(sql, userId, now)).map((r) => toMailbox(r, now));
}

export async function getMailbox(sql: Sql, userId: string, id: string, now: Date = new Date()): Promise<Mailbox | null> {
  const [row] = await selectMailboxes(sql, userId, now, id);
  return row ? toMailbox(row, now) : null;
}

/** Saves the mailbox as 'checking' and logs in to SMTP and IMAP in the background. */
export async function connectMailbox(deps: MailboxDeps, userId: string, req: ConnectMailboxRequest): Promise<Mailbox> {
  const { sql } = deps;
  const [count] = await sql<{ n: number }[]>`select count(*)::int as n from mailboxes where clerk_user_id = ${userId}`;
  if ((count?.n ?? 0) >= MAX_MAILBOXES) throw new MailboxError('too_many_mailboxes', `At most ${MAX_MAILBOXES} mailboxes.`);
  const [row] = await sql<{ id: string }[]>`
    insert into mailboxes (clerk_user_id, address, display_name, provider, smtp_host, smtp_port, smtp_secure,
      imap_host, imap_port, username, secret, daily_cap, warm, signature, status)
    values (${userId}, ${req.address}, ${req.displayName}, 'smtp', ${req.smtpHost.toLowerCase()}, ${req.smtpPort},
      ${req.smtpPort === 465}, ${req.imapHost.toLowerCase()}, ${req.imapPort}, ${req.username ?? req.address},
      ${deps.secrets.seal(req.password)}, ${req.dailyCap ?? 30}, ${req.warm ?? false}, ${req.signature ?? ''}, 'checking')
    on conflict (clerk_user_id, address) do nothing
    returning id
  `;
  if (!row) throw new MailboxError('exists', `${req.address} is already connected.`);
  const mailbox = (await getMailbox(sql, userId, row.id))!;
  startCheck(deps, row.id);
  return mailbox;
}

function startCheck(deps: MailboxDeps, id: string): void {
  void checkMailbox(deps, id).catch((err: unknown) => deps.log.error({ err, mailboxId: id }, 'mailbox check failed'));
}

/**
 * Logs in to SMTP and IMAP. Success makes a checking or errored mailbox
 * active (a paused one stays paused); a failure sets 'error' and a reason
 * the user can act on.
 */
export async function checkMailbox(deps: MailboxDeps, mailboxId: string): Promise<void> {
  const { sql } = deps;
  const [row] = await sql<MailboxRow[]>`select * from mailboxes where id = ${mailboxId}`;
  if (!row) return;
  let result: CheckResult;
  try {
    const transport = deps.transport(credentialsFor(deps.secrets, row));
    try {
      result = await transport.check();
    } finally {
      await transport.close().catch(() => {});
    }
  } catch (err) {
    if (!(err instanceof SecretsError)) throw err;
    await sql`
      update mailboxes set status = 'error', status_reason = 'The saved password no longer opens. Enter it again.'
      where id = ${mailboxId}`;
    return;
  }
  if (result.ok) {
    await sql`
      update mailboxes set status = 'active', status_reason = null
      where id = ${mailboxId} and status in ('checking', 'error')`;
  } else {
    const reason = checkReason(row, result);
    deps.log.info({ mailboxId, step: result.step, kind: result.kind, message: result.message }, 'mailbox check refused');
    await sql`update mailboxes set status = 'error', status_reason = ${reason} where id = ${mailboxId}`;
  }
}

/** Plain words for a failed check, with the provider's own fix when we know it. */
export function checkReason(row: Pick<MailboxRow, 'smtp_host' | 'smtp_port' | 'imap_host' | 'imap_port'>, r: Extract<CheckResult, { ok: false }>): string {
  const host = r.step === 'smtp' ? row.smtp_host : row.imap_host;
  const port = r.step === 'smtp' ? row.smtp_port : row.imap_port;
  const side = r.step === 'smtp' ? 'SMTP' : 'IMAP';
  const google = /(^|\.)(gmail|googlemail|google)\.com$/.test(host);
  const microsoft = /(^|\.)(office365|outlook|office)\.com$/.test(host);
  switch (r.kind) {
    case 'auth':
      if (google) return 'Google refused the password. Use an app password (myaccount.google.com/apppasswords).';
      if (microsoft) return 'Microsoft refused the login. Your admin must allow SMTP AUTH for this mailbox, and an account with MFA needs an app password.';
      return `The ${side} server refused the username or password. Check them, or make an app password if the account has two-step login.`;
    case 'connect':
      return `Could not reach ${host} on port ${port}. Check the ${side} host and port.`;
    case 'tls':
      return r.step === 'smtp'
        ? `The secure connection to ${host}:${port} failed. Port 465 uses TLS from the start, 587 uses STARTTLS.`
        : `The secure connection to ${host}:${port} failed. IMAP over TLS is usually port 993.`;
    default:
      return `The ${side} server said: ${r.message.slice(0, 200)}`;
  }
}

/** A new password or a switch back to active checks the mailbox again. */
export async function updateMailbox(deps: MailboxDeps, userId: string, id: string, req: UpdateMailboxRequest): Promise<Mailbox | null> {
  const { sql } = deps;
  const [cur] = await sql<Pick<MailboxRow, 'status' | 'warm'>[]>`
    select status, warm from mailboxes where id = ${id} and clerk_user_id = ${userId}`;
  if (!cur) return null;
  const set: Record<string, unknown> = {};
  if (req.displayName !== undefined) set.display_name = req.displayName;
  if (req.dailyCap !== undefined) set.daily_cap = req.dailyCap;
  if (req.signature !== undefined) set.signature = req.signature;
  if (req.warm !== undefined) {
    set.warm = req.warm;
    // Back to cold starts the ramp over.
    if (cur.warm && !req.warm) set.ramp_started_at = new Date();
  }
  let check = false;
  if (req.status === 'paused') {
    set.status = 'paused';
    set.status_reason = null;
  } else if (req.status === 'active' && cur.status !== 'active') {
    set.status = 'checking';
    set.status_reason = null;
    check = true;
  }
  if (req.password !== undefined) {
    set.secret = deps.secrets.seal(req.password);
    if (req.status !== 'paused') {
      set.status = 'checking';
      set.status_reason = null;
      check = true;
    }
  }
  if (Object.keys(set).length > 0) {
    await sql`update mailboxes set ${sql(set)} where id = ${id} and clerk_user_id = ${userId}`;
  }
  const mailbox = await getMailbox(sql, userId, id);
  if (check) startCheck(deps, id);
  return mailbox;
}

/** Its sent messages and leads stay, with the mailbox set null. */
export async function deleteMailbox(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from mailboxes where id = ${id} and clerk_user_id = ${userId} returning id`;
  return rows.length > 0;
}
