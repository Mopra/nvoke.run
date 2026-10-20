import { z } from 'zod';
import {
  AgentSignupRequest,
  AgentSignupResponse,
  ApiKeyIdParams,
  ApiKeyListResponse,
  ClaimRequest,
  ClaimResponse,
  ClaimStatusResponse,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from './agents.ts';
import { HealthResponse, MeResponse } from './api.ts';
import {
  CompaniesPage,
  CompaniesQuery,
  CreateSearchRequest,
  DraftOpenersRequest,
  DraftOpenersResponse,
  LeadFilters,
  Search,
  SearchIdParams,
  SearchListResponse,
  SearchMoreRequest,
  UpdateSearchRequest,
} from './leads.ts';
import {
  LocalCrawlClaimRequest,
  LocalCrawlClaimResponse,
  LocalCrawlResultRequest,
  LocalCrawlResultResponse,
} from './local-crawl.ts';
import { PlansResponse } from './plans.ts';
import { OptOutRequest, OptOutResponse } from './privacy.ts';
import { BuildSiteProfileRequest, SiteProfile, UpdateSiteProfileRequest } from './site-profile.ts';
import {
  ToolEmailAuthRequest,
  ToolEmailAuthResponse,
  ToolExtractEmailsRequest,
  ToolExtractEmailsResponse,
  ToolVerifyEmailRequest,
  ToolVerifyEmailResponse,
} from './tools.ts';
import {
  CreateWebhookRequest,
  CreateWebhookResponse,
  UpdateWebhookRequest,
  Webhook,
  WebhookDeliveryListResponse,
  WebhookIdParams,
  WebhookListResponse,
  WebhookTestResponse,
} from './webhooks.ts';

/**
 * Every public endpoint and MCP tool, described once. The server builds
 * `GET /v1/openapi.json` from the endpoints and registers the MCP tools from
 * the tools; the site renders both into /docs. Add a route here when you add
 * it to the server, or it is undocumented.
 */

/** `key`: an API key, desktop token, Clerk session or OAuth token. `session`: a Clerk session from the site. */
export type EndpointAuth = 'public' | 'key' | 'session';

export interface Endpoint {
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Fastify style, `:id` for path parameters. */
  path: string;
  group: 'Account' | 'Searches' | 'Leads' | 'Webhooks' | 'API keys' | 'Agents' | 'Privacy' | 'Tools' | 'Meta';
  summary: string;
  description: string;
  auth: EndpointAuth;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Success status and body. `csv` for text/csv, null for an empty body. */
  status: number;
  response: z.ZodType | 'csv' | null;
  /** Error codes this endpoint may answer with, besides 401 and 5xx. */
  errors: string[];
  /** A request body or query to show in the docs. */
  example?: unknown;
}

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'getMe',
    method: 'GET',
    path: '/v1/me',
    group: 'Account',
    summary: 'Who you are, your plan and this month’s usage',
    description:
      'Returns the account behind the token: profile, plan, verified emails used this month and the allowance. `?sync=1` re-reads the plan from billing first. `billingUrl` is where a human upgrades.',
    auth: 'key',
    status: 200,
    response: MeResponse,
    errors: [],
  },
  {
    id: 'listPlans',
    method: 'GET',
    path: '/v1/plans',
    group: 'Account',
    summary: 'The plan ladder',
    description: 'Every plan with its monthly allowance of verified emails and its price in USD. One product, every feature on every plan.',
    auth: 'public',
    status: 200,
    response: PlansResponse,
    errors: [],
  },
  {
    id: 'getSiteProfile',
    method: 'GET',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Your site profile and suggested searches',
    description:
      'What your own website says you sell, to whom, the proof it offers and the words it uses, with 3 to 6 searches that find your buyers. `not_found` until you build one with `POST /v1/site-profile`.',
    auth: 'key',
    status: 200,
    response: SiteProfile,
    errors: ['not_found'],
  },
  {
    id: 'buildSiteProfile',
    method: 'POST',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Read your website and plan searches',
    description:
      'Reads your homepage and its about, pricing and services pages (robots.txt honored), then Claude writes the profile and suggests 3 to 6 searches. Each suggestion holds a `search` body you can send to `POST /v1/searches` as is. Replaces the stored profile. Free, 10 a day per account. Takes about 20 seconds.',
    auth: 'key',
    body: BuildSiteProfileRequest,
    status: 200,
    response: SiteProfile,
    errors: ['invalid_request', 'site_unreadable', 'rate_limited', 'ai_unavailable'],
    example: { website: 'acme.dk' },
  },
  {
    id: 'updateSiteProfile',
    method: 'PATCH',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Edit your site profile',
    description: 'Changes the fields you send and keeps the rest. Suggestions stay as they were built.',
    auth: 'key',
    body: UpdateSiteProfileRequest,
    status: 200,
    response: SiteProfile,
    errors: ['invalid_request', 'not_found'],
    example: { audience: 'Dental clinics in Denmark with 3 to 20 chairs' },
  },
  {
    id: 'deleteSiteProfile',
    method: 'DELETE',
    path: '/v1/site-profile',
    group: 'Account',
    summary: 'Delete your site profile',
    description: 'Deletes the profile, its suggested searches and its screenshot. Searches you started from it stay. Openers stop using it.',
    auth: 'key',
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'createSearch',
    method: 'POST',
    path: '/v1/searches',
    group: 'Searches',
    summary: 'Start a search',
    description:
      'Queues a search and returns it at once with status `queued`. Our servers find the companies, read their websites and check every address. Poll `GET /v1/searches/{id}` until the status is `done`, `failed` or `canceled`. `limit` caps the companies looked at (default 100, at most 1,000). Kind `domains` takes a list you already have in `params.items`: domains, URLs, email addresses (for their domain) or company names, up to 1,000. Domains are read as given; each name is looked up on the web and its website kept. Its `limit` defaults to the length of the list. Kind `icp` takes who you sell to in plain words (`params.description`, optionally `product`, `countries` and `locations`): nvoke plans the queries, reads agency directories and list pages, keeps the companies that fit and reports what it does in `stage` and `stageNote`. Shared inboxes (info@, sales@) reach no person, so only one is checked per company, and only when no named person there is valid: the best one (sales@ first). The rest stay hidden and free. Send `checkInboxes: true` to check all of them, or switch it on later with `PATCH /v1/searches/{id}`.',
    auth: 'key',
    body: CreateSearchRequest,
    status: 201,
    response: Search,
    errors: ['invalid_request', 'quota_exceeded', 'source_unavailable'],
    example: { kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 50 },
  },
  {
    id: 'listSearches',
    method: 'GET',
    path: '/v1/searches',
    group: 'Searches',
    summary: 'List your searches',
    description: 'All your searches, newest first, with their counters.',
    auth: 'key',
    status: 200,
    response: SearchListResponse,
    errors: [],
  },
  {
    id: 'getSearch',
    method: 'GET',
    path: '/v1/searches/:id',
    group: 'Searches',
    summary: 'Get a search',
    description:
      'One search with its status and counters: companies found and crawled, emails found and emails verified valid. `error` says why a search failed, for example `quota_exceeded`.',
    auth: 'key',
    params: SearchIdParams,
    status: 200,
    response: Search,
    errors: ['not_found'],
  },
  {
    id: 'searchMore',
    method: 'POST',
    path: '/v1/searches/:id/more',
    group: 'Searches',
    summary: 'Search again into the same list',
    description:
      'Runs a finished search again with new params of the same kind, for example a wider area or another keyword, and adds what it finds to the same list. Companies the search already holds are skipped, so `limit` caps the new companies only. The search goes back to `queued` and its counters keep counting from where they were; `runs` lists every run. Answers 409 `search_running` while it still runs.',
    auth: 'key',
    params: SearchIdParams,
    body: SearchMoreRequest,
    status: 200,
    response: Search,
    errors: ['invalid_request', 'not_found', 'search_running', 'kind_mismatch', 'quota_exceeded', 'source_unavailable'],
    example: { kind: 'local', params: { niche: 'dentists', location: 'Odense' }, limit: 50 },
  },
  {
    id: 'updateSearch',
    method: 'PATCH',
    path: '/v1/searches/:id',
    group: 'Searches',
    summary: 'Keep a search going, check shared inboxes',
    description:
      'Send `ongoing`, `checkInboxes` or both. `checkInboxes` works on every kind: on checks every shared inbox (info@, sales@) the search left unchecked at companies with no valid personal address, not only the one each such company gets anyway (`inboxesSkipped` says how many), low priority after the named people, and shows the valid ones as they settle (`inboxesPending` counts what is still to settle). Only valid ones count against your allowance, like any verified email. A canceled search answers 400 `search_canceled` and a used up allowance 403 `quota_exceeded`. Off stops checking new ones and keeps what was checked. `ongoing` switches daily rounds on or off for a Describe your customer (`icp`) search. An ongoing search runs a fresh round once a day, at the time of day it was created, whenever it is not running: new niches, countries, cities and list pages it has not searched yet, so new leads arrive over days. It pauses while the month’s verified emails are used up and resumes when they renew; `stageNote` says what it does. Off by default; canceling a search switches it off. Every `icp` search also pushes on by itself when it comes up short, up to 3 fresh rounds in 24 hours, ongoing or not. Other kinds answer 400 `ongoing_not_supported`.',
    auth: 'key',
    params: SearchIdParams,
    body: UpdateSearchRequest,
    status: 200,
    response: Search,
    errors: ['invalid_request', 'not_found', 'ongoing_not_supported', 'search_canceled', 'quota_exceeded'],
    example: { checkInboxes: true },
  },
  {
    id: 'cancelSearch',
    method: 'POST',
    path: '/v1/searches/:id/cancel',
    group: 'Searches',
    summary: 'Cancel a running search',
    description: 'Stops a queued or running search. What it found so far stays.',
    auth: 'key',
    params: SearchIdParams,
    status: 200,
    response: Search,
    errors: ['not_found', 'not_cancelable'],
  },
  {
    id: 'deleteSearch',
    method: 'DELETE',
    path: '/v1/searches/:id',
    group: 'Searches',
    summary: 'Delete a search',
    description: 'Deletes the search with its companies and emails. Cannot be undone.',
    auth: 'key',
    params: SearchIdParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'listCompanies',
    method: 'GET',
    path: '/v1/searches/:id/companies',
    group: 'Leads',
    summary: 'List companies with their emails',
    description:
      'The companies a search found, each with its checked email addresses, 50 to a page. Filter by `verification` (`valid` is what you usually want), by `kind` (`generic` like info@, or `personal`), by `people=true` (only addresses with a named person), by `decisionMakers=true` (only founders, executives and directors) and by `q` (name, domain or address). `total` counts the companies that match. Pass `nextCursor` back as `cursor` for the next page. Addresses appear once their check has run.',
    auth: 'key',
    params: SearchIdParams,
    query: CompaniesQuery,
    status: 200,
    response: CompaniesPage,
    errors: ['not_found', 'invalid_request'],
    example: { verification: 'valid', limit: 50 },
  },
  {
    id: 'exportCsv',
    method: 'GET',
    path: '/v1/searches/:id/export.csv',
    group: 'Leads',
    summary: 'Export as CSV',
    description:
      'One row per email: company, domain, website, email, first_name, last_name, title, seniority, kind, verification, source_url, found_via, confidence, location, phone, opener. Takes the same filters as the company list, `people` and `decisionMakers` included.',
    auth: 'key',
    params: SearchIdParams,
    query: LeadFilters,
    status: 200,
    response: 'csv',
    errors: ['not_found', 'invalid_request'],
    example: { verification: 'valid' },
  },
  {
    id: 'draftOpeners',
    method: 'POST',
    path: '/v1/searches/:id/openers',
    group: 'Leads',
    summary: 'Draft an opener per company',
    description:
      'Claude drafts one first line per company from the pages nvoke read on its site, only for companies with at least one valid email, so the cost follows your verified emails. Every line rests on a fact the page states (`opener.quote`, verbatim, on `opener.sourceUrl`); no merge tags, nothing invented, and `none` when the pages hold nothing to build on. Uses your site profile (`POST /v1/site-profile`) when there is one. Pass `companyIds` for some companies, or leave it out for the whole search. Runs in the background: read `opener` on the companies from the company list, and the `opener` column in the CSV. nvoke never sends anything.',
    auth: 'key',
    params: SearchIdParams,
    body: DraftOpenersRequest,
    status: 202,
    response: DraftOpenersResponse,
    errors: ['not_found', 'invalid_request', 'ai_unavailable'],
    example: {},
  },
  {
    id: 'claimLocalCrawl',
    method: 'POST',
    path: '/v1/local-crawl/claim',
    group: 'Leads',
    summary: 'Claim sites to read from your own computer',
    description:
      'For the desktop app’s local render crawl. Hands out up to `max` companies from your searches of the last 30 days whose crawl ended without an address because the site refused our servers (`refused`), needs JavaScript (`js_only`) or showed no address (`done`), each held for 10 minutes. `reasons` picks which (default `refused` and `js_only`); refused and JS-only sites come first. Read them under the same rules as nvokebot (robots.txt, one page a second, 8 pages, no logins, no CAPTCHAs) and send what you found to `POST /v1/local-crawl/results`. Empty while this month’s allowance is used up.',
    auth: 'key',
    body: LocalCrawlClaimRequest,
    status: 200,
    response: LocalCrawlClaimResponse,
    errors: ['invalid_request'],
    example: { max: 3, reasons: ['refused', 'js_only', 'done'] },
  },
  {
    id: 'submitLocalCrawl',
    method: 'POST',
    path: '/v1/local-crawl/results',
    group: 'Leads',
    summary: 'Send what a local crawl found',
    description:
      'The addresses found on a claimed company’s site and the page each was on. We check every address again (shape, placeholders, the company’s own domain, opt-outs), store the rest in that search and verify them like any other; you pay only for valid ones. Nothing sent here enters the shared cache.',
    auth: 'key',
    body: LocalCrawlResultRequest,
    status: 200,
    response: LocalCrawlResultResponse,
    errors: ['invalid_request', 'not_found', 'not_claimed'],
    example: { companyId: '00000000-0000-4000-8000-000000000000', outcome: 'done', emails: [{ address: 'info@example.dk', sourceUrl: 'https://example.dk/kontakt' }], pages: 3 },
  },
  {
    id: 'listWebhooks',
    method: 'GET',
    path: '/v1/webhooks',
    group: 'Webhooks',
    summary: 'List webhooks',
    description: 'Your webhooks with the outcome of their last deliveries. A webhook we turned off after a day of failures has `enabled: false` and `disabledReason` `failing`.',
    auth: 'key',
    status: 200,
    response: WebhookListResponse,
    errors: [],
  },
  {
    id: 'createWebhook',
    method: 'POST',
    path: '/v1/webhooks',
    group: 'Webhooks',
    summary: 'Create a webhook',
    description:
      'We POST `lead.ready` for every company with a valid address once its checks settle, and `search.finished` when a search ends. `scope` `drops` or a `dropId` limits it to searches drops made. Requests are signed the Standard Webhooks way (`webhook-id`, `webhook-timestamp`, `webhook-signature`); the response holds the signing secret, and it is never shown again. HTTPS on a public address only. At most 10 webhooks.',
    auth: 'key',
    body: CreateWebhookRequest,
    status: 201,
    response: CreateWebhookResponse,
    errors: ['invalid_request', 'too_many_webhooks', 'webhook_url_not_allowed'],
    example: { url: 'https://example.com/hooks/nvoke', events: ['lead.ready'], scope: 'drops' },
  },
  {
    id: 'updateWebhook',
    method: 'PATCH',
    path: '/v1/webhooks/:id',
    group: 'Webhooks',
    summary: 'Change a webhook',
    description: 'Change the URL, events or scope, or pause and resume it with `enabled`. `dropId: null` widens it to the whole scope again.',
    auth: 'key',
    params: WebhookIdParams,
    body: UpdateWebhookRequest,
    status: 200,
    response: Webhook,
    errors: ['not_found', 'invalid_request', 'webhook_url_not_allowed'],
    example: { enabled: true },
  },
  {
    id: 'deleteWebhook',
    method: 'DELETE',
    path: '/v1/webhooks/:id',
    group: 'Webhooks',
    summary: 'Delete a webhook',
    description: 'Stops it at once and drops its pending deliveries.',
    auth: 'key',
    params: WebhookIdParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'testWebhook',
    method: 'POST',
    path: '/v1/webhooks/:id/test',
    group: 'Webhooks',
    summary: 'Send a test event',
    description: 'Sends a signed `ping` event right now and tells you how your server answered.',
    auth: 'key',
    params: WebhookIdParams,
    status: 200,
    response: WebhookTestResponse,
    errors: ['not_found', 'webhook_url_not_allowed'],
  },
  {
    id: 'listWebhookDeliveries',
    method: 'GET',
    path: '/v1/webhooks/:id/deliveries',
    group: 'Webhooks',
    summary: 'Recent deliveries',
    description: 'The last 50 deliveries with their status, attempts and the last answer from your server. Kept 30 days.',
    auth: 'key',
    params: WebhookIdParams,
    status: 200,
    response: WebhookDeliveryListResponse,
    errors: ['not_found'],
  },
  {
    id: 'listApiKeys',
    method: 'GET',
    path: '/v1/api-keys',
    group: 'API keys',
    summary: 'List API keys',
    description: 'Your live API keys. Only the prefix of each key is shown.',
    auth: 'key',
    status: 200,
    response: ApiKeyListResponse,
    errors: [],
  },
  {
    id: 'createApiKey',
    method: 'POST',
    path: '/v1/api-keys',
    group: 'API keys',
    summary: 'Create an API key',
    description: 'Makes a new key. The response holds the full key, and it is never shown again. At most 20 live keys.',
    auth: 'key',
    body: CreateApiKeyRequest,
    status: 201,
    response: CreateApiKeyResponse,
    errors: ['invalid_request', 'api_key_limit'],
    example: { name: 'CRM sync' },
  },
  {
    id: 'revokeApiKey',
    method: 'DELETE',
    path: '/v1/api-keys/:id',
    group: 'API keys',
    summary: 'Revoke an API key',
    description: 'The key stops working at once. A key may revoke itself.',
    auth: 'key',
    params: ApiKeyIdParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'agentSignup',
    method: 'POST',
    path: '/v1/agents/signup',
    group: 'Agents',
    summary: 'Sign up as an agent',
    description:
      'Creates an nvoke account for the person you work for and returns an API key at once. No browser, no human needed. The free plan applies: 50 verified emails a month. We send that person one email with a link to claim the account. Unclaimed accounts work for 7 days, then answer 403 `claim_required` until claimed, and are deleted after 30 days. Rate limited per IP, per email domain and per day.',
    auth: 'public',
    body: AgentSignupRequest,
    status: 201,
    response: AgentSignupResponse,
    errors: ['invalid_request', 'account_exists', 'email_not_accepted', 'rate_limited', 'signup_unavailable'],
    example: { email: 'ada@example.com', agentName: 'Claude' },
  },
  {
    id: 'getClaim',
    method: 'GET',
    path: '/v1/agents/claim',
    group: 'Agents',
    summary: 'Read an account before claiming it',
    description: 'Called by the claim page on nvoke.run: who created the account and whether it is claimed. Unlike every other signed-in request, it does not claim the account.',
    auth: 'session',
    status: 200,
    response: ClaimStatusResponse,
    errors: [],
  },
  {
    id: 'claimAccount',
    method: 'POST',
    path: '/v1/agents/claim',
    group: 'Agents',
    summary: 'Claim an account an agent created',
    description: 'Called by the claim page on nvoke.run after the human signs in from the emailed link. Accepts the terms and keeps or revokes the agent’s key.',
    auth: 'session',
    body: ClaimRequest,
    status: 200,
    response: ClaimResponse,
    errors: ['invalid_request'],
  },
  {
    id: 'optOut',
    method: 'POST',
    path: '/v1/privacy/opt-out',
    group: 'Privacy',
    summary: 'Opt an address or domain out',
    description: 'Stops collection of an address or a whole domain and deletes what we hold. Always answers `{ ok: true }`.',
    auth: 'public',
    body: OptOutRequest,
    status: 200,
    response: OptOutResponse,
    errors: ['invalid_request'],
  },
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
  {
    id: 'openapi',
    method: 'GET',
    path: '/v1/openapi.json',
    group: 'Meta',
    summary: 'This API as OpenAPI 3.1',
    description: 'Machine readable description of every endpoint above.',
    auth: 'public',
    status: 200,
    response: z.object({ openapi: z.string() }).loose(),
    errors: [],
  },
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    group: 'Meta',
    summary: 'Health check',
    description: 'Answers 200 when the API is up.',
    auth: 'public',
    status: 200,
    response: HealthResponse,
    errors: [],
  },
];

/** What every error code means. Shown in the docs and the OpenAPI document. */
export const ERROR_CODES: Record<string, string> = {
  unauthorized: 'No valid token. Send `Authorization: Bearer <key>`.',
  claim_required: 'An agent created this account more than 7 days ago and nobody claimed it. The human claims it from the emailed link.',
  invalid_request: 'The body or query failed validation. `details` lists the problems.',
  not_found: 'No such search, key or webhook on this account.',
  quota_exceeded: 'This month’s verified emails are used up. A human upgrades at `billingUrl`, sent with this error and by `GET /v1/me`.',
  source_unavailable: 'Web search is paused on our side. Local and launch searches still work.',
  not_cancelable: 'The search already finished.',
  search_running: 'The search is still running. Wait for it to finish, or cancel it, then search again.',
  kind_mismatch: 'A search runs again with its own kind. Start a new search for another kind.',
  ongoing_not_supported: 'Only Describe your customer (`icp`) searches can be ongoing.',
  search_canceled: 'The search was canceled, so it checks nothing more. Search again into it first.',
  not_claimed: 'The company is not claimed for a local crawl right now. Claim it again with `POST /v1/local-crawl/claim`.',
  api_key_limit: 'The account holds 20 live keys. Revoke one first.',
  account_exists: 'An account with this email exists. Ask the human for an API key.',
  email_not_accepted: 'Disposable inbox, an opted-out address, or a domain that receives no mail.',
  rate_limited: 'Too many requests of this kind from this account or client. Try again later.',
  captcha_failed: 'The Turnstile token was missing or did not pass. Solve the challenge again.',
  busy: 'Too many free tool checks are running or today’s free allowance is used up. Try again later, or sign up.',
  site_unreadable: 'We could not read the website: it is down, robots.txt keeps us out, it refuses our servers or it needs JavaScript. `detail` says which.',
  ai_unavailable: 'Claude could not answer right now, or the account spent its monthly Claude budget. Try again later.',
  signup_unavailable: 'Agent sign-up is switched off right now.',
  too_many_webhooks: 'The account holds 10 webhooks. Delete one first.',
  webhook_url_not_allowed: 'Webhook URLs must be HTTPS on a public address that resolves.',
  database_unavailable: 'Our database is unreachable. Retry with backoff.',
};

const searchId = z.uuid().describe('The search id from start_search or list_searches.');
const verification = z
  .enum(['valid', 'invalid', 'risky', 'catch_all', 'unknown'])
  .optional()
  .describe('Only emails with this check result. `valid` is what you usually want.');

export interface McpTool {
  name: string;
  title: string;
  description: string;
  /** Object schema of the arguments. */
  input: z.ZodObject;
  readOnly: boolean;
  destructive: boolean;
}

/** The tools of the MCP server at `/mcp`. Each one calls the REST endpoint named in its description. */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'get_account',
    title: 'Account, plan and usage',
    description:
      'Who you are signed in as, the plan, verified emails used this month and the allowance, and the billing link a human uses to upgrade. Call this first.',
    input: z.object({}),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'start_search',
    title: 'Start a lead search',
    description:
      'Starts finding companies and their verified emails. kind `local`: a trade in a place, from OpenStreetMap (needs niche and location). kind `web`: a keyword, optionally in a country, from web search (needs keyword). kind `launches`: products launched recently on Product Hunt and Show HN (keyword optional). kind `domains`: contacts at companies you already know (needs items: domains, URLs or company names). kind `icp`: describe your customer in plain words and nvoke plans the searches (needs description; product and countries optional). Returns the search at once; it runs for a few minutes on our servers. Then call wait_for_search.',
    input: z.object({
      kind: z.enum(['local', 'web', 'launches', 'domains', 'icp']),
      niche: z.string().optional().describe('local: the trade, e.g. "dentists".'),
      location: z.string().optional().describe('local: a city, region or country, e.g. "Austin".'),
      keyword: z.string().optional().describe('web: required. launches: optional filter.'),
      items: z
        .array(z.string())
        .max(1000)
        .optional()
        .describe('domains: required. Domains ("acme.com"), URLs, email addresses or company names ("Stripe"), up to 1,000.'),
      country: z.string().optional().describe('web and domains: ISO 3166-1 alpha-2 country code, e.g. "dk". For domains it helps find the right website for a name.'),
      description: z.string().max(2000).optional().describe('icp: required. Who you sell to, in plain words, e.g. "B2B SaaS founders in Germany who run their own outbound".'),
      product: z.string().max(1000).optional().describe('icp: what you sell, so competitors are told apart from buyers.'),
      countries: z.array(z.string()).max(30).optional().describe('icp: ISO 3166-1 alpha-2 country codes. Left out, nvoke picks.'),
      locations: z.array(z.string()).max(30).optional().describe('icp: cities or regions to favour, for customers that are local businesses.'),
      days: z.number().int().min(1).max(30).optional().describe('launches: how many days back, default 7.'),
      limit: z.number().int().min(1).max(1000).optional().describe('Companies to look at, default 100. domains: the length of the list.'),
      checkInboxes: z
        .boolean()
        .optional()
        .describe('Check every shared inbox (info@, sales@). Off by default: then only the best one is checked at a company with no valid named person. Only valid ones count against your allowance.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'wait_for_search',
    title: 'Wait for a search',
    description:
      'Waits until the search finishes or the timeout passes, then returns it. Call again while status is `queued` or `running`. Counters grow as it runs.',
    input: z.object({
      searchId,
      timeoutSeconds: z.number().int().min(1).max(50).optional().describe('Default 45.'),
    }),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_search',
    title: 'Get a search',
    description: 'One search with status and counters.',
    input: z.object({ searchId }),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'list_searches',
    title: 'List searches',
    description: 'Your searches, newest first.',
    input: z.object({}),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'get_leads',
    title: 'Get leads',
    description:
      'Companies a search found with their checked emails, 50 to a page. Use verification `valid` for addresses that accept mail. Pass nextCursor back as cursor for more.',
    input: z.object({
      searchId,
      verification,
      kind: z.enum(['generic', 'personal']).optional().describe('`generic` is info@ and the like; `personal` is a person’s mailbox.'),
      q: z.string().optional().describe('Match on company name, domain or address.'),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
    }),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'export_csv',
    title: 'Export as CSV',
    description: 'The search as CSV text, one row per email. Same filters as get_leads.',
    input: z.object({
      searchId,
      verification,
      kind: z.enum(['generic', 'personal']).optional(),
      q: z.string().optional(),
    }),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'draft_openers',
    title: 'Draft openers',
    description:
      'Drafts one first line per company of a search from its own website, for companies with a valid email. Each line rests on a quote from the page (opener.quote, opener.sourceUrl); no merge tags, nothing invented. Runs in the background: read opener on get_leads a minute later, or the opener column of export_csv. Copy and export only; nvoke never sends.',
    input: z.object({
      searchId,
      companyIds: z.array(z.uuid()).max(1000).optional().describe('Only these companies. The whole search when left out.'),
      redo: z.boolean().optional().describe('Draft again where an opener is already there.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'search_more',
    title: 'Search again into the same list',
    description:
      'Runs a finished search again with new arguments of the same kind (a wider location, another keyword, more items) and adds only the companies it does not hold yet. limit caps the new companies. Then call wait_for_search.',
    input: z.object({
      searchId,
      kind: z.enum(['local', 'web', 'launches', 'domains']).describe('The kind the search already has. Describe your customer searches keep pushing on their own and take no second run here.'),
      niche: z.string().optional().describe('local: the trade, e.g. "dentists".'),
      location: z.string().optional().describe('local: a city, region or country, e.g. "Odense".'),
      keyword: z.string().optional().describe('web: required. launches: optional filter.'),
      items: z.array(z.string()).max(1000).optional().describe('domains: required. More domains, URLs, email addresses or company names.'),
      country: z.string().optional().describe('web and domains: ISO 3166-1 alpha-2 country code.'),
      days: z.number().int().min(1).max(30).optional().describe('launches: how many days back, default 7.'),
      limit: z.number().int().min(1).max(1000).optional().describe('New companies to look at, default 100. domains: the length of the list.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'set_search_ongoing',
    title: 'Keep a search going',
    description:
      'Switches ongoing on or off for a Describe your customer (icp) search. Ongoing searches run a fresh round every day, so new leads arrive over days; they pause while the month’s allowance is used up. Only icp searches.',
    input: z.object({ searchId, ongoing: z.boolean().describe('true keeps it going every day, false stops that.') }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'set_check_inboxes',
    title: 'Check shared inboxes',
    description:
      'Switches checking of every shared inbox (info@, sales@) on or off for a search of any kind. Off by default: then only the best one is checked at a company with no valid named person. On checks the ones the search left unchecked (inboxesSkipped on the search says how many), after the named people; only valid ones count against the allowance. Refused on a canceled search or a used up allowance. Off stops new checks and keeps what was checked.',
    input: z.object({ searchId, checkInboxes: z.boolean().describe('true checks them, false stops new checks.') }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'cancel_search',
    title: 'Cancel a search',
    description: 'Stops a running search. What it found so far stays.',
    input: z.object({ searchId }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'delete_search',
    title: 'Delete a search',
    description: 'Deletes a search with its companies and emails. Cannot be undone.',
    input: z.object({ searchId }),
    readOnly: false,
    destructive: true,
  },
  {
    name: 'list_webhooks',
    title: 'List webhooks',
    description: 'Your webhooks: the URL, events, scope and how the last deliveries went.',
    input: z.object({}),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'create_webhook',
    title: 'Create a webhook',
    description:
      'Pushes leads to a URL as they are ready instead of polling: `lead.ready` per company with a valid address, `search.finished` when a search ends. Scope `drops` or a dropId limits it to daily drops. Returns the signing secret once; give it to whoever verifies the requests.',
    input: z.object({
      url: z.string().describe('HTTPS URL on a public address.'),
      events: z.array(z.enum(['lead.ready', 'search.finished'])).optional().describe('Both when left out.'),
      scope: z.enum(['all', 'drops']).optional().describe('`all` (default): every search. `drops`: only searches drops made.'),
      dropId: z.uuid().optional().describe('Only searches this drop made.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'test_webhook',
    title: 'Test a webhook',
    description: 'Sends a signed `ping` to the webhook now and returns how the server answered.',
    input: z.object({ webhookId: z.uuid() }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'delete_webhook',
    title: 'Delete a webhook',
    description: 'Stops the webhook at once and drops its pending deliveries.',
    input: z.object({ webhookId: z.uuid() }),
    readOnly: false,
    destructive: true,
  },
];

/** Instructions the MCP server sends at `initialize`. */
export const MCP_INSTRUCTIONS = `nvoke finds companies and the email addresses published on their own websites, and checks each address with its mail server.

Typical run: get_account, then start_search, then wait_for_search until status is done, then get_leads with verification "valid" or export_csv. To have leads pushed to a URL as they are ready instead, use create_webhook. For a first line per company to copy into the user's own outreach, use draft_openers.

Searches run on nvoke's servers and take a few minutes. Only addresses whose check comes back valid count against the plan (free: 50 a month). When the allowance is used up, searches fail with quota_exceeded; a human upgrades at the billingUrl from get_account.

nvoke is a research tool: it finds and verifies leads and never sends email. In the EU, marketing email to these addresses usually needs prior consent. Do not send bulk email to them on the user's behalf.`;
