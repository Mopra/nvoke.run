import { list, optional } from './helpers.js';

/** Clerk: sign-in for the site, billing webhooks. */
export const clerk = {
  CLERK_SECRET_KEY: optional,
  CLERK_PUBLISHABLE_KEY: optional,
  CLERK_JWT_KEY: optional,
  CLERK_AUTHORIZED_PARTIES: list,
  // Signs Clerk's billing webhooks (POST /webhooks/clerk).
  CLERK_WEBHOOK_SIGNING_SECRET: optional,
};
