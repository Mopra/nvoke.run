import { optional } from './helpers.js';

/**
 * Sign in with Microsoft for mailboxes (docs/sending/plan.md, "Step 2"): the
 * Entra app registration. Both unset: only password mailboxes.
 */
export const microsoftMail = {
  MICROSOFT_MAIL_CLIENT_ID: optional,
  MICROSOFT_MAIL_CLIENT_SECRET: optional,
};
