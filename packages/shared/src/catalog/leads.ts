// The Leads group of the catalog: its endpoints, the MCP tools that call them and its error codes.

import { z } from 'zod';
import { CompaniesPage, CompaniesQuery, Company, CompanyParams, DraftOpenersRequest, DraftOpenersResponse, EmailParams, LeadFilters, SearchIdParams, UpdateCompanyRequest } from '../leads.ts';
import { LocalCrawlClaimRequest, LocalCrawlClaimResponse, LocalCrawlResultRequest, LocalCrawlResultResponse } from '../local-crawl.ts';
import { searchId } from './common.ts';
import type { Endpoint, McpTool } from './types.ts';

const companyId = z.uuid().describe('The company id from get_leads.');
const verification = z
  .enum(['valid', 'invalid', 'risky', 'catch_all', 'unknown'])
  .optional()
  .describe('Only emails with this check result. `valid` is what you usually want.');

export const leadEndpoints: Endpoint[] = [
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
    id: 'getCompany',
    method: 'GET',
    path: '/v1/searches/:id/companies/:companyId',
    group: 'Leads',
    summary: 'Get one company',
    description: 'One company of the search with its checked email addresses, as the company list shows it.',
    auth: 'key',
    params: CompanyParams,
    status: 200,
    response: Company,
    errors: ['not_found'],
  },
  {
    id: 'updateCompany',
    method: 'PATCH',
    path: '/v1/searches/:id/companies/:companyId',
    group: 'Leads',
    summary: 'Edit a company',
    description:
      'Change `name`, `location`, `phone` or `category`; null clears one (the name cannot be cleared). `opener` sets your own first line in place of the drafted one, null removes it. The domain and website stay: they are what the emails were found on. The search gets a new `editedAt`, so copies elsewhere know to fetch it again.',
    auth: 'key',
    params: CompanyParams,
    body: UpdateCompanyRequest,
    status: 200,
    response: Company,
    errors: ['not_found', 'invalid_request'],
    example: { name: 'Acme Dental', phone: '+45 12 34 56 78' },
  },
  {
    id: 'deleteCompany',
    method: 'DELETE',
    path: '/v1/searches/:id/companies/:companyId',
    group: 'Leads',
    summary: 'Delete a company',
    description:
      'Removes the company and its emails from the search and counts the search again. Valid emails already counted against your allowance stay counted. Cannot be undone.',
    auth: 'key',
    params: CompanyParams,
    status: 204,
    response: null,
    errors: ['not_found'],
  },
  {
    id: 'deleteEmail',
    method: 'DELETE',
    path: '/v1/searches/:id/companies/:companyId/emails/:emailId',
    group: 'Leads',
    summary: 'Delete an email',
    description:
      'Removes one address from the company and counts the search again. A valid email already counted against your allowance stays counted. Cannot be undone.',
    auth: 'key',
    params: EmailParams,
    status: 204,
    response: null,
    errors: ['not_found'],
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
];

export const leadTools: McpTool[] = [
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
    name: 'get_company',
    title: 'Get one company',
    description: 'One company of a search with its checked emails, as get_leads shows it.',
    input: z.object({ searchId, companyId }),
    readOnly: true,
    destructive: false,
  },
  {
    name: 'update_company',
    title: 'Edit a company',
    description:
      'Changes name, location, phone or category of a company; null clears one (not the name). opener sets the user\u2019s own first line, null removes it.',
    input: z.object({
      searchId,
      companyId,
      name: z.string().optional(),
      location: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      category: z.string().nullable().optional(),
      opener: z.string().nullable().optional().describe('The first line, at most 300 characters. null removes it.'),
    }),
    readOnly: false,
    destructive: false,
  },
  {
    name: 'delete_company',
    title: 'Delete a company',
    description: 'Removes a company and its emails from a search. Valid emails already counted against the allowance stay counted. Cannot be undone.',
    input: z.object({ searchId, companyId }),
    readOnly: false,
    destructive: true,
  },
  {
    name: 'delete_email',
    title: 'Delete an email',
    description: 'Removes one email address from a company. Cannot be undone.',
    input: z.object({ searchId, companyId, emailId: z.uuid().describe('The email id from get_leads.') }),
    readOnly: false,
    destructive: true,
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
];

export const leadErrors: Record<string, string> = {
  not_claimed: 'The company is not claimed for a local crawl right now. Claim it again with `POST /v1/local-crawl/claim`.',
};
