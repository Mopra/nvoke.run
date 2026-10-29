// The Searches group of the catalog: its endpoints, the MCP tools that call them and its error codes.

import { z } from 'zod';
import { CreateSearchRequest, Search, SearchIdParams, SearchListResponse, SearchMoreRequest, UpdateSearchRequest } from '../leads.ts';
import { searchId } from './common.ts';
import type { Endpoint, McpTool } from './types.ts';

export const searchEndpoints: Endpoint[] = [
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
];

export const searchTools: McpTool[] = [
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
];

/** Tools that change a search. MCP_TOOLS lists them after the lead tools. */
export const searchChangeTools: McpTool[] = [
  {
    name: 'search_more',
    title: 'Search again into the same list',
    description:
      'Runs a finished search again with new arguments of the same kind (a wider location, another keyword, more items) and adds only the companies it does not hold yet. limit caps the new companies. Then call wait_for_search.',
    input: z.object({
      searchId,
      kind: z.enum(['local', 'web', 'launches', 'domains']).describe('The kind the search already has. Sonar searches keep pushing on their own and take no second run here.'),
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
      'Switches ongoing on or off for a Sonar (icp) search. Ongoing searches run a fresh round every day, so new leads arrive over days; they pause while the month’s allowance is used up. Only icp searches.',
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
];

export const searchErrors: Record<string, string> = {
  quota_exceeded: 'This month’s verified emails are used up. A human upgrades at `billingUrl`, sent with this error and by `GET /v1/me`.',
  source_unavailable: 'Web search is paused on our side. Local and launch searches still work.',
  not_cancelable: 'The search already finished.',
  search_running: 'The search is still running. Wait for it to finish, or cancel it, then search again.',
  kind_mismatch: 'A search runs again with its own kind. Start a new search for another kind.',
  ongoing_not_supported: 'Only Sonar (`icp`) searches can be ongoing.',
  search_canceled: 'The search was canceled, so it checks nothing more. Search again into it first.',
};
