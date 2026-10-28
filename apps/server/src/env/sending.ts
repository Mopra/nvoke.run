import { flag, list, optional } from './helpers.js';

/** Sending (docs/sending/plan.md). Internal to nvoke only. */
export const sending = {
  // 32 random bytes, base64: seals mailbox passwords at rest and signs
  // unsubscribe links. Without it sending is off.
  SECRETS_KEY: optional,
  // false stops every send and IMAP poll at once, without touching campaigns.
  SENDING_ENABLED: flag('true'),
  // Clerk user ids allowed to send, comma separated: nvoke's own account
  // only. Sending is not a customer feature; everyone else gets 404 on the
  // sending routes and the worker never touches their campaigns. Empty means nobody.
  SENDING_USERS: list,
};
