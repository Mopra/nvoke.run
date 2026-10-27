// The seams between the sending modules (docs/sending/plan.md). Only
// mailbox-transport.ts talks SMTP and IMAP; everything else goes through
// MailTransport, and tests use the fake from fake-transport.ts.

/** What a transport needs to reach one mailbox. The secret is already opened. */
export interface MailboxCredentials {
  address: string;
  displayName: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  username: string;
  /** Empty for a mailbox that signs in with OAuth. */
  password: string;
  /** A Microsoft mailbox: a fresh access token for XOAUTH2, refreshed and saved when it runs out (oauth.ts). */
  accessToken?: () => Promise<string>;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  /** Plain text. No HTML, no tracking. */
  text: string;
  /** Our own Message-ID, `<uuid@sender-domain>`, made by the caller so it is known before the send. */
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  /** Extra headers: List-Unsubscribe and List-Unsubscribe-Post. */
  headers: Record<string, string>;
}

export type SendResult =
  | { ok: true; response: string }
  /** permanent: a 5xx for this recipient, do not try again. auth: the login failed, pause the mailbox. */
  | { ok: false; kind: 'permanent' | 'temporary' | 'auth'; response: string };

/** One message read from a folder, after the last UID we had. */
export interface IncomingMail {
  folder: string;
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string;
  to: string[];
  subject: string;
  text: string;
  /** Lowercased header names to values, for classify.ts (Auto-Submitted, X-Autoreply, Content-Type ...). */
  headers: Record<string, string>;
  /** The message/delivery-status part of a bounce report, raw, when there is one. */
  deliveryStatus: string | null;
  date: Date;
}

/** Where a poll left off, per folder. Stored in mailboxes.poll_state. */
export type PollState = Record<string, { uidValidity: number; lastUid: number }>;

export interface PollResult {
  messages: IncomingMail[];
  state: PollState;
}

export type CheckResult =
  | { ok: true }
  | { ok: false; step: 'smtp' | 'imap'; kind: 'auth' | 'connect' | 'tls' | 'other'; message: string };

export interface MailTransport {
  send(mail: OutgoingMail): Promise<SendResult>;
  /** INBOX and the spam folder, after the UIDs in `state`. A changed UIDVALIDITY starts that folder over from the last 7 days. */
  poll(state: PollState): Promise<PollResult>;
  /** Log in to SMTP and IMAP without sending anything. */
  check(): Promise<CheckResult>;
  close(): Promise<void>;
}

export type TransportFactory = (creds: MailboxCredentials) => MailTransport;
