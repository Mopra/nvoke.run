// The Tools group of the catalog: its endpoints and its error codes.

import { ToolEmailAuthRequest, ToolEmailAuthResponse, ToolExtractEmailsRequest, ToolExtractEmailsResponse, ToolVerifyEmailRequest, ToolVerifyEmailResponse } from '../tools.ts';
import type { Endpoint } from './types.ts';

export const toolEndpoints: Endpoint[] = [
  {
    id: 'toolVerifyEmail',
    method: 'POST',
    path: '/v1/tools/verify-email',
    group: 'Tools',
    summary: 'Check one email address, free',
    description:
      'The free email verifier on nvoke.run/tools. Syntax, disposable domains, MX records and, while the small free probe budget lasts, the mail server itself (`depth: mailbox`). Past that budget it answers from syntax and DNS (`depth: domain`). Rate limited per IP and per day. For volume, use a search of kind `domains` with an API key.',
    auth: 'public',
    body: ToolVerifyEmailRequest,
    status: 200,
    response: ToolVerifyEmailResponse,
    errors: ['invalid_request', 'rate_limited', 'captcha_failed'],
    example: { email: 'hello@example.com' },
  },
  {
    id: 'toolExtractEmails',
    method: 'POST',
    path: '/v1/tools/extract-emails',
    group: 'Tools',
    summary: 'Read one website for emails, free',
    description:
      'The free website email extractor on nvoke.run/tools. Reads the homepage and likely contact pages of one domain (robots.txt honored, opt-outs respected) and returns its generic role addresses. Addresses of people are counted in `hiddenPersonal` and shown only in a search. Rate limited per IP and per day.',
    auth: 'public',
    body: ToolExtractEmailsRequest,
    status: 200,
    response: ToolExtractEmailsResponse,
    errors: ['invalid_request', 'rate_limited', 'captcha_failed', 'busy'],
    example: { domain: 'example.com' },
  },
  {
    id: 'toolEmailAuth',
    method: 'POST',
    path: '/v1/tools/email-auth',
    group: 'Tools',
    summary: 'Check SPF, DMARC, DKIM and MX, free',
    description:
      'The free SPF and DMARC checker on nvoke.run/tools. DNS only: MX hosts, the SPF record with its lookup count, the DMARC policy and DKIM keys under common selectors, each graded pass, warn or fail. Rate limited per IP.',
    auth: 'public',
    body: ToolEmailAuthRequest,
    status: 200,
    response: ToolEmailAuthResponse,
    errors: ['invalid_request', 'rate_limited'],
    example: { domain: 'example.com' },
  },
];

export const toolErrors: Record<string, string> = {
  captcha_failed: 'The Turnstile token was missing or did not pass. Solve the challenge again.',
  busy: 'Too many free tool checks are running or today’s free allowance is used up. Try again later, or sign up.',
};
