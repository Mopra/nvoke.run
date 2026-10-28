import { list, optional } from './helpers.js';

/** Operator alerts by email through Day3. */
export const alerts = {
  DAY3_API_KEY: optional,
  ALERT_EMAIL_TO: list,
  ALERT_EMAIL_FROM: optional,
};
