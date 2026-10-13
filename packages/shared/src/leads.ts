import { z } from 'zod';
import { AccountOrigin } from './agents.ts';
import { DropRunParams } from './drops.ts';
import { Plan } from './plans.ts';

/**
 * Lead pipeline contracts: searches, companies, emails, usage. The server
 * validates requests and shapes responses with these; the desktop parses
 * responses with them.
 */

/** `drop` searches are made by drops (drops.ts), never by a client. */
export const SearchKind = z.enum(['local', 'web', 'launches', 'drop']);
export type SearchKind = z.infer<typeof SearchKind>;

export const SearchStatus = z.enum(['queued', 'running', 'done', 'failed', 'canceled']);
export type SearchStatus = z.infer<typeof SearchStatus>;

export const Verification = z.enum(['valid', 'invalid', 'risky', 'catch_all', 'unknown']);
export type Verification = z.infer<typeof Verification>;

export const EmailKind = z.enum(['generic', 'personal']);
export type EmailKind = z.infer<typeof EmailKind>;

export const CrawlStatus = z.enum(['pending', 'done', 'failed', 'blocked']);
export type CrawlStatus = z.infer<typeof CrawlStatus>;

export const LaunchSource = z.enum(['product_hunt', 'show_hn']);
export type LaunchSource = z.infer<typeof LaunchSource>;

const text = (max: number) => z.string().trim().min(1).max(max);

/** "dentists" in "Copenhagen". Resolved through OpenStreetMap. */
export const LocalSearchParams = z.object({
  niche: text(100),
  location: text(200),
});
export type LocalSearchParams = z.infer<typeof LocalSearchParams>;

/** A web search keyword, optionally scoped to a country (ISO 3166-1 alpha-2). */
export const WebSearchParams = z.object({
  keyword: text(200),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .transform((v) => v.toLowerCase())
    .optional(),
});
export type WebSearchParams = z.infer<typeof WebSearchParams>;

/** Recent launches on Product Hunt and Show HN, optionally filtered by keyword. */
export const LaunchesSearchParams = z.object({
  keyword: text(100).optional(),
  days: z.number().int().min(1).max(30).default(7),
  sources: z.array(LaunchSource).min(1).optional(),
});
export type LaunchesSearchParams = z.infer<typeof LaunchesSearchParams>;

export const SEARCH_LIMIT_DEFAULT = 100;
export const SEARCH_LIMIT_MAX = 1000;
const limit = z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional();

export const CreateSearchRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), params: LocalSearchParams, limit }),
  z.object({ kind: z.literal('web'), params: WebSearchParams, limit }),
  z.object({ kind: z.literal('launches'), params: LaunchesSearchParams, limit }),
]);
export type CreateSearchRequest = z.infer<typeof CreateSearchRequest>;
/** What a client sends: `limit` and `days` may be left out for the defaults. */
export type CreateSearchInput = z.input<typeof CreateSearchRequest>;

const SearchBase = z.object({
  id: z.uuid(),
  limit: z.number().int().positive(),
  status: SearchStatus,
  /** Machine readable when it matters, for example `quota_exceeded`. */
  error: z.string().nullable(),
  companiesFound: z.number().int().nonnegative(),
  companiesCrawled: z.number().int().nonnegative(),
  emailsFound: z.number().int().nonnegative(),
  emailsValid: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  finishedAt: z.iso.datetime({ offset: true }).nullable(),
});

export const Search = z.discriminatedUnion('kind', [
  SearchBase.extend({ kind: z.literal('local'), params: LocalSearchParams }),
  SearchBase.extend({ kind: z.literal('web'), params: WebSearchParams }),
  SearchBase.extend({ kind: z.literal('launches'), params: LaunchesSearchParams }),
  SearchBase.extend({ kind: z.literal('drop'), params: DropRunParams }),
]);
export type Search = z.infer<typeof Search>;

export const SearchListResponse = z.object({
  searches: z.array(Search),
});
export type SearchListResponse = z.infer<typeof SearchListResponse>;

export const Email = z.object({
  id: z.uuid(),
  address: z.string(),
  kind: EmailKind,
  sourceUrl: z.string().nullable(),
  /** Null until the address has been checked. */
  verification: Verification.nullable(),
  checkedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Email = z.infer<typeof Email>;

export const Company = z.object({
  id: z.uuid(),
  name: z.string(),
  domain: z.string(),
  website: z.string(),
  source: z.string(),
  sourceRef: z.string().nullable(),
  location: z.string().nullable(),
  phone: z.string().nullable(),
  category: z.string().nullable(),
  crawlStatus: CrawlStatus,
  crawledAt: z.iso.datetime({ offset: true }).nullable(),
  emails: z.array(Email),
});
export type Company = z.infer<typeof Company>;

/**
 * Filters shared by the company list and the CSV export. With `verification`
 * or `kind` set, only companies with a matching email are returned, and only
 * the matching emails. `q` matches company name, domain or email address.
 */
export const LeadFilters = z.object({
  verification: Verification.optional(),
  kind: EmailKind.optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type LeadFilters = z.infer<typeof LeadFilters>;

export const CompaniesQuery = LeadFilters.extend({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type CompaniesQuery = z.infer<typeof CompaniesQuery>;

export const CompaniesPage = z.object({
  companies: z.array(Company),
  /** Pass back as `cursor` for the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
  /** Companies matching the filters across all pages. */
  total: z.number().int().nonnegative(),
});
export type CompaniesPage = z.infer<typeof CompaniesPage>;

export const SearchIdParams = z.object({
  id: z.uuid(),
});
export type SearchIdParams = z.infer<typeof SearchIdParams>;

/** Column order of `GET /v1/searches/:id/export.csv`. */
export const CSV_COLUMNS = [
  'company',
  'domain',
  'website',
  'email',
  'kind',
  'verification',
  'source_url',
  'location',
  'phone',
] as const;

export const Usage = z.object({
  /** yyyy-mm, UTC. */
  period: z.string().regex(/^\d{4}-\d{2}$/),
  /** Verified emails charged this period. */
  emailsVerified: z.number().int().nonnegative(),
  emailsLimit: z.number().int().positive(),
});
export type Usage = z.infer<typeof Usage>;

/** Plan and usage for this period. Merged into `GET /v1/me` (MeResponse). */
export const AccountSummary = z.object({
  userId: z.string(),
  plan: Plan,
  usage: Usage,
  /** Highest `limit` a single search may ask for. The same on every plan. */
  maxSearchLimit: z.number().int().positive(),
  account: AccountOrigin,
});
export type AccountSummary = z.infer<typeof AccountSummary>;

/** Error codes the lead routes return in `{ error }`. */
export const LeadsErrorCode = z.enum([
  'unauthorized',
  'not_found',
  'invalid_request',
  'quota_exceeded',
  'not_cancelable',
  'database_unavailable',
  'source_unavailable',
]);
export type LeadsErrorCode = z.infer<typeof LeadsErrorCode>;
