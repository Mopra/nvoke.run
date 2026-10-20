// A MailTransport for tests: sends land in `sent`, a poll returns what is in
// `inbox` after the UIDs in the state, and `nextSend` and `checkResult`
// script the answers. One fake serves every mailbox; `sent` records the
// credentials' address in `from` so a test can tell them apart.

import type { CheckResult, IncomingMail, MailboxCredentials, OutgoingMail, PollState, SendResult, TransportFactory } from './types.js';

export interface FakeSent extends OutgoingMail {
  from: string;
}

export interface FakeTransport {
  factory: TransportFactory;
  sent: FakeSent[];
  /** Mails to hand out on poll, any folder. Give each a rising uid per folder. */
  inbox: IncomingMail[];
  /** Answers for the next sends, taken in order. Empty: ok. */
  nextSend: SendResult[];
  checkResult: CheckResult;
  /** Addresses of the mailboxes that were opened, one entry per factory call. */
  opened: string[];
}

export function createFakeTransport(): FakeTransport {
  const fake: FakeTransport = {
    sent: [],
    inbox: [],
    nextSend: [],
    checkResult: { ok: true },
    opened: [],
    factory: (creds: MailboxCredentials) => {
      fake.opened.push(creds.address);
      return {
        async send(mail) {
          const result = fake.nextSend.shift() ?? { ok: true, response: '250 2.0.0 OK queued' };
          if (result.ok) fake.sent.push({ ...mail, from: creds.address });
          return result;
        },
        async poll(state: PollState) {
          const next: PollState = { ...state };
          const messages = fake.inbox.filter((m) => {
            const seen = state[m.folder]?.lastUid ?? 0;
            return m.uid > seen;
          });
          for (const m of messages) {
            const cur = next[m.folder] ?? { uidValidity: 1, lastUid: 0 };
            next[m.folder] = { uidValidity: cur.uidValidity, lastUid: Math.max(cur.lastUid, m.uid) };
          }
          return { messages, state: next };
        },
        async check() {
          return fake.checkResult;
        },
        async close() {},
      };
    },
  };
  return fake;
}
