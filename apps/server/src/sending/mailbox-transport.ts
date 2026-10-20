// The only file that talks SMTP and IMAP (docs/sending/plan.md, "Step 1").
// Mail goes out through the mailbox provider's own submission server with
// nodemailer; replies, bounces and auto replies come in over IMAP with
// imapflow, read only, from INBOX and the spam folder (special use \Junk),
// and mailparser turns each raw message into an IncomingMail.

import { ImapFlow, type FetchMessageObject, type ListResponse } from 'imapflow';
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser';
import nodemailer from 'nodemailer';
import type { ConnectionOptions } from 'node:tls';
import type {
  CheckResult,
  IncomingMail,
  MailboxCredentials,
  MailTransport,
  OutgoingMail,
  PollResult,
  PollState,
  SendResult,
  TransportFactory,
} from './types.js';

/** How far back a folder starts when it is new to us or its UIDVALIDITY changed. */
export const POLL_BACKFILL_DAYS = 7;
/** Messages read per folder per poll; the rest come on the next poll. */
export const POLL_BATCH = 100;
const TIMEOUT_MS = 30_000;

export interface TransportOptions {
  /** TLS options for both sides; tests pass `{ rejectUnauthorized: false }` for a self-signed server. */
  tls?: ConnectionOptions;
  now?: () => Date;
}

export const smtpImapTransport: TransportFactory = (creds) => createSmtpImapTransport(creds);

export function createSmtpImapTransport(creds: MailboxCredentials, opts: TransportOptions = {}): MailTransport {
  const now = opts.now ?? (() => new Date());
  // true: TLS from the first byte (465). false: STARTTLS, and refuse to go on without it.
  const smtp = nodemailer.createTransport({
    host: creds.smtpHost,
    port: creds.smtpPort,
    secure: creds.smtpSecure,
    requireTLS: !creds.smtpSecure,
    auth: { user: creds.username, pass: creds.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
    tls: opts.tls,
  });

  const imap = () =>
    new ImapFlow({
      host: creds.imapHost,
      port: creds.imapPort,
      secure: creds.imapPort !== 143,
      auth: { user: creds.username, pass: creds.password },
      logger: false,
      tls: opts.tls,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS * 2,
    });

  return {
    async send(mail: OutgoingMail): Promise<SendResult> {
      try {
        const info = await smtp.sendMail({
          from: { name: creds.displayName, address: creds.address },
          to: mail.to,
          subject: mail.subject,
          text: mail.text,
          messageId: mail.messageId,
          inReplyTo: mail.inReplyTo,
          references: mail.references,
          headers: mail.headers,
        });
        // A server can take the message and still refuse the one recipient.
        if (info.rejected.length > 0) return { ok: false, kind: 'permanent', response: info.response };
        return { ok: true, response: info.response };
      } catch (err) {
        return sendFailure(err);
      }
    },

    async poll(state: PollState): Promise<PollResult> {
      const client = imap();
      await client.connect();
      try {
        const folders = pollFolders(await client.list());
        const next: PollState = { ...state };
        const messages: IncomingMail[] = [];
        for (const folder of folders) {
          const lock = await client.getMailboxLock(folder, { readOnly: true });
          try {
            const box = client.mailbox;
            if (!box) continue;
            const plan = planFolder(state[folder], Number(box.uidValidity));
            let uids: number[];
            if (plan.since) {
              const found = await client.search({ since: new Date(now().getTime() - POLL_BACKFILL_DAYS * 86_400_000) }, { uid: true });
              uids = (found || []).sort((a, b) => a - b);
            } else if (plan.fromUid < box.uidNext) {
              const found = await client.search({ uid: `${plan.fromUid}:*` }, { uid: true });
              // `n:*` names the last message even when n is past it, so filter.
              uids = (found || []).filter((u) => u >= plan.fromUid).sort((a, b) => a - b);
            } else {
              uids = [];
            }
            uids = uids.slice(0, POLL_BATCH);
            let lastUid = plan.lastUid;
            if (uids.length > 0) {
              for await (const msg of client.fetch(uids.join(','), { uid: true, source: true }, { uid: true })) {
                const m = msg as FetchMessageObject;
                if (m.source) messages.push(await parseIncoming(folder, m.uid, m.source, now()));
                lastUid = Math.max(lastUid, m.uid);
              }
            }
            next[folder] = { uidValidity: plan.uidValidity, lastUid };
          } finally {
            lock.release();
          }
        }
        return { messages, state: next };
      } finally {
        await client.logout().catch(() => client.close());
      }
    },

    async check(): Promise<CheckResult> {
      try {
        await smtp.verify();
      } catch (err) {
        return { ok: false, step: 'smtp', ...checkFailure(err) };
      }
      const client = imap();
      try {
        await client.connect();
      } catch (err) {
        return { ok: false, step: 'imap', ...checkFailure(err) };
      } finally {
        await client.logout().catch(() => client.close());
      }
      return { ok: true };
    },

    async close() {
      smtp.close();
    },
  };
}

// Pure steps, exported for tests

/** INBOX and the spam folder when the server marks one \Junk. */
export function pollFolders(list: Pick<ListResponse, 'path' | 'specialUse'>[]): string[] {
  const folders = ['INBOX'];
  const junk = list.find((f) => f.specialUse === '\\Junk');
  if (junk && junk.path.toUpperCase() !== 'INBOX') folders.push(junk.path);
  return folders;
}

export interface FolderPlan {
  uidValidity: number;
  /** Search by date instead of UID: the folder is new to us or its UIDs were reset. */
  since: boolean;
  /** First UID to read when not `since`. */
  fromUid: number;
  /** What lastUid is when nothing new arrives. */
  lastUid: number;
}

export function planFolder(prev: PollState[string] | undefined, uidValidity: number): FolderPlan {
  if (!prev || prev.uidValidity !== uidValidity) return { uidValidity, since: true, fromUid: 1, lastUid: 0 };
  return { uidValidity, since: false, fromUid: prev.lastUid + 1, lastUid: prev.lastUid };
}

const addresses = (a: AddressObject | AddressObject[] | undefined): string[] =>
  (Array.isArray(a) ? a : a ? [a] : []).flatMap((o) => o.value).flatMap((v) => (v.address ? [v.address.toLowerCase()] : []));

const idList = (v: string | string[] | undefined): string[] =>
  (Array.isArray(v) ? v : v ? v.split(/\s+/) : []).map((s) => s.trim()).filter(Boolean);

/** One raw RFC 5322 message to the shape classify.ts and the poller read. */
export async function parseIncoming(folder: string, uid: number, source: Buffer | string, received: Date): Promise<IncomingMail> {
  const parsed: ParsedMail = await simpleParser(source, { skipImageLinks: true, skipTextToHtml: true });
  const headers: Record<string, string> = {};
  for (const h of parsed.headerLines) {
    const key = h.key.toLowerCase();
    if (key in headers) continue;
    const colon = h.line.indexOf(':');
    headers[key] = h.line.slice(colon + 1).replace(/\r?\n[ \t]+/g, ' ').trim();
  }
  return {
    folder,
    uid,
    messageId: parsed.messageId ?? null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: idList(parsed.references),
    from: addresses(parsed.from)[0] ?? '',
    to: addresses(parsed.to),
    subject: parsed.subject ?? '',
    text: parsed.text ?? '',
    headers,
    deliveryStatus: deliveryStatusPart(typeof source === 'string' ? source : source.toString('utf8')),
    date: parsed.date ?? received,
  };
}

/**
 * The body of the message/delivery-status part, cut from the raw source:
 * mailparser folds that part into `text`, and classify.ts wants it alone.
 */
export function deliveryStatusPart(raw: string): string | null {
  const head = /^content-type:[ \t]*message\/(?:global-)?delivery-status\b/im.exec(raw);
  if (!head) return null;
  const afterHead = raw.slice(head.index);
  const blank = /\r?\n\r?\n/.exec(afterHead);
  if (!blank) return null;
  const rest = afterHead.slice(blank.index + blank[0].length);
  const end = rest.search(/^--\S/m);
  return (end < 0 ? rest : rest.slice(0, end)).replace(/\r\n/g, '\n').trim() || null;
}

interface MailError {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
  authenticationFailed?: boolean;
  tlsFailed?: boolean;
}

const AUTH_CODES = new Set([530, 534, 535]);

export function sendFailure(err: unknown): SendResult {
  const e = (err ?? {}) as MailError;
  const response = e.response ?? e.message ?? String(err);
  if (e.code === 'EAUTH' || (e.responseCode !== undefined && AUTH_CODES.has(e.responseCode))) return { ok: false, kind: 'auth', response };
  if (e.responseCode !== undefined && e.responseCode >= 500) return { ok: false, kind: 'permanent', response };
  return { ok: false, kind: 'temporary', response };
}

const CONNECT_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EHOSTUNREACH', 'EDNS', 'NoConnection']);

export function checkFailure(err: unknown): { kind: 'auth' | 'connect' | 'tls' | 'other'; message: string } {
  const e = (err ?? {}) as MailError;
  const message = (e.response ?? e.message ?? String(err)).slice(0, 300);
  if (e.authenticationFailed || e.code === 'EAUTH' || (e.responseCode !== undefined && AUTH_CODES.has(e.responseCode))) return { kind: 'auth', message };
  if (e.tlsFailed || e.code === 'ETLS' || /certificate|ssl|tls|wrong version/i.test(message)) return { kind: 'tls', message };
  if ((e.code && CONNECT_CODES.has(e.code)) || /timed? ?out|ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(message)) return { kind: 'connect', message };
  return { kind: 'other', message };
}
