// What a mail that arrives in a sending mailbox is (docs/sending/plan.md).

import type { IncomingMail } from './types.js';

export type Classified =
  | { kind: 'bounce'; hard: boolean; recipient: string | null; status: string | null }
  | { kind: 'auto_reply' }
  | { kind: 'human'; optOut: boolean };

export function classifyMail(mail: IncomingMail): Classified {
  void mail;
  throw new Error('not implemented');
}
