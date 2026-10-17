import { z } from 'zod';
import { Verification } from './leads.ts';

/**
 * Public free tools (no sign-in), shown on nvoke.run/tools. Each route is
 * rate limited per client IP and capped per day. When the server is set up
 * with Turnstile, `turnstileToken` is required.
 */

const turnstileToken = z.string().max(2048).optional().describe('Cloudflare Turnstile token, when the server asks for one.');

/** `POST /v1/tools/verify-email`. */
export const ToolVerifyEmailRequest = z.object({
  email: z.string().trim().min(3).max(320),
  turnstileToken,
});
export type ToolVerifyEmailRequest = z.infer<typeof ToolVerifyEmailRequest>;

export const ToolVerifyEmailResponse = z.object({
  email: z.string(),
  verification: Verification,
  /** Machine readable reason, like `rcpt_accepted`, `no_mx` or `disposable`. */
  reason: z.string(),
  mxHost: z.string().nullable(),
  /**
   * `mailbox`: the mail server was asked about this address (now or within
   * the last week). `domain`: only syntax and DNS were checked, because the
   * free probe budget was used up; the full check runs after signing up.
   */
  depth: z.enum(['mailbox', 'domain']),
});
export type ToolVerifyEmailResponse = z.infer<typeof ToolVerifyEmailResponse>;

/** `POST /v1/tools/extract-emails`. */
export const ToolExtractEmailsRequest = z.object({
  domain: z.string().trim().min(3).max(253),
  turnstileToken,
});
export type ToolExtractEmailsRequest = z.infer<typeof ToolExtractEmailsRequest>;

export const ToolExtractEmailsResponse = z.object({
  domain: z.string(),
  /**
   * `done`: the site was read. `blocked`: robots.txt keeps nvokebot out.
   * `refused`: the site refuses our servers. `js_only`: a JavaScript app with
   * nothing in its HTML. `failed`: the site did not answer. `opted_out`: the
   * domain asked not to be collected.
   */
  status: z.enum(['done', 'blocked', 'refused', 'js_only', 'failed', 'opted_out']),
  /** Generic role addresses (info@, sales@) on the company's own domain. */
  emails: z.array(z.object({ address: z.string(), sourceUrl: z.string().nullable() })),
  /** Addresses of people found on the site. Shown only after signing up. */
  hiddenPersonal: z.number().int().min(0),
  /** True when the answer came from a crawl within the last weeks. */
  cached: z.boolean(),
});
export type ToolExtractEmailsResponse = z.infer<typeof ToolExtractEmailsResponse>;

/** `POST /v1/tools/email-auth`. */
export const ToolEmailAuthRequest = z.object({
  domain: z.string().trim().min(3).max(253),
});
export type ToolEmailAuthRequest = z.infer<typeof ToolEmailAuthRequest>;

const Grade = z.enum(['pass', 'warn', 'fail']);

export const ToolEmailAuthResponse = z.object({
  domain: z.string(),
  mx: z.object({ grade: Grade, hosts: z.array(z.string()), notes: z.array(z.string()) }),
  spf: z.object({
    grade: Grade,
    record: z.string().nullable(),
    /** The `all` qualifier: `-all`, `~all`, `?all`, `+all`, or null when missing. */
    all: z.string().nullable(),
    /** DNS lookups the record costs, includes followed. More than 10 breaks SPF. */
    lookups: z.number().int().min(0),
    notes: z.array(z.string()),
  }),
  dmarc: z.object({
    grade: Grade,
    record: z.string().nullable(),
    policy: z.enum(['none', 'quarantine', 'reject']).nullable(),
    notes: z.array(z.string()),
  }),
  dkim: z.object({
    grade: Grade,
    /** Selectors among the common ones that publish a key. DKIM has no index, so absence proves nothing. */
    selectors: z.array(z.string()),
    notes: z.array(z.string()),
  }),
});
export type ToolEmailAuthResponse = z.infer<typeof ToolEmailAuthResponse>;
