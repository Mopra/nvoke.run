import { z } from 'zod';
import { AccountOrigin } from './agents.ts';
import { DropRunParams } from './drops.ts';
import { itemDomain } from './lists.ts';
import { Plan } from './plans.ts';

/**
 * Lead pipeline contracts: searches, companies, emails, usage. The server
 * validates requests and shapes responses with these; the desktop parses
 * responses with them.
 */

/** `drop` searches are made by drops (drops.ts), never by a client. */
export const SearchKind = z.enum(['local', 'web', 'launches', 'domains', 'drop']);
export type SearchKind = z.infer<typeof SearchKind>;

export const SearchStatus = z.enum(['queued', 'running', 'done', 'failed', 'canceled']);
export type SearchStatus = z.infer<typeof SearchStatus>;

export const Verification = z.enum(['valid', 'invalid', 'risky', 'catch_all', 'unknown']);
export type Verification = z.infer<typeof Verification>;

export const EmailKind = z.enum(['generic', 'personal']);
export type EmailKind = z.infer<typeof EmailKind>;

/**
 * How the server crawl ended. `blocked`: robots.txt or an opt-out keeps us
 * out. `refused`: the site refuses our servers. `js_only`: the site needs
 * JavaScript. The last two can be read by the desktop app (local-crawl.ts).
 */
export const CrawlStatus = z.enum(['pending', 'done', 'failed', 'blocked', 'refused', 'js_only']);
export type CrawlStatus = z.infer<typeof CrawlStatus>;

/** The desktop's local render crawl of a refused or JS-only site: claimed, then how it ended. */
export const LocalCrawlStatus = z.enum(['claimed', 'done', 'failed', 'blocked']);
export type LocalCrawlStatus = z.infer<typeof LocalCrawlStatus>;

export const LaunchSource = z.enum(['product_hunt', 'show_hn']);
export type LaunchSource = z.infer<typeof LaunchSource>;

const text = (max: number) => z.string().trim().min(1).max(max);
const country = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/)
  .transform((v) => v.toLowerCase());

/** "dentists" in "Copenhagen". Resolved through OpenStreetMap. */
export const LocalSearchParams = z.object({
  niche: text(100),
  location: text(200),
});
export type LocalSearchParams = z.infer<typeof LocalSearchParams>;

/** A web search keyword, optionally scoped to a country (ISO 3166-1 alpha-2). */
export const WebSearchParams = z.object({
  keyword: text(200),
  country: country.optional(),
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

/**
 * A list the user already has: domains, URLs, email addresses (for their
 * domain) or company names, up to the search limit. Domains are crawled
 * as given; names are looked up through web search. `splitList` (lists.ts)
 * turns pasted text into `items`. Repeats are dropped.
 */
export const DomainsSearchParams = z.object({
  items: z
    .array(text(200))
    .min(1)
    .max(SEARCH_LIMIT_MAX)
    .transform((items) => {
      const seen = new Set<string>();
      return items.filter((item) => {
        const key = itemDomain(item) ?? item.toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }),
  /** Where the named companies are, to pick the right website. ISO 3166-1 alpha-2. */
  country: country.optional(),
});
export type DomainsSearchParams = z.infer<typeof DomainsSearchParams>;
const limit = z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional();

export const CreateSearchRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), params: LocalSearchParams, limit }),
  z.object({ kind: z.literal('web'), params: WebSearchParams, limit }),
  z.object({ kind: z.literal('launches'), params: LaunchesSearchParams, limit }),
  /** `limit` defaults to the number of items; a smaller one takes the first ones. */
  z.object({ kind: z.literal('domains'), params: DomainsSearchParams, limit }),
]);
export type CreateSearchRequest = z.infer<typeof CreateSearchRequest>;
/** What a client sends: `limit` and `days` may be left out for the defaults. */
export type CreateSearchInput = z.input<typeof CreateSearchRequest>;

/**
 * Another run in a finished search, with the same kind and new params:
 * `limit` more companies at most. Companies the search already holds are
 * skipped, so the list only grows by what is new.
 */
export const SearchMoreRequest = CreateSearchRequest;
export type SearchMoreRequest = z.infer<typeof SearchMoreRequest>;

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

/**
 * One run of a search: the params it ran with, how many more companies it
 * asked for and how many the search held when it started, so the next run's
 * `foundBefore` (or `companiesFound` for the last run) says what it added.
 */
function runs<P extends z.ZodType>(params: P) {
  return z
    .array(
      z.object({
        params,
        limit: z.number().int().positive(),
        foundBefore: z.number().int().nonnegative(),
        createdAt: z.iso.datetime({ offset: true }),
      }),
    )
    .optional();
}

/**
 * `params` and `limit` are the latest run's: `limit` is the total the search
 * may hold once it ends. `runs` lists every run in order, the first one too;
 * a drop's searches have none.
 */
export const Search = z.discriminatedUnion('kind', [
  SearchBase.extend({ kind: z.literal('local'), params: LocalSearchParams, runs: runs(LocalSearchParams) }),
  SearchBase.extend({ kind: z.literal('web'), params: WebSearchParams, runs: runs(WebSearchParams) }),
  SearchBase.extend({ kind: z.literal('launches'), params: LaunchesSearchParams, runs: runs(LaunchesSearchParams) }),
  SearchBase.extend({ kind: z.literal('domains'), params: DomainsSearchParams, runs: runs(DomainsSearchParams) }),
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

/**
 * A drafted opener: `queued` while Claude writes it, `done` with a line,
 * `none` when the company's pages hold no fact to build on (or were never
 * read), `failed` when Claude could not answer. Copy and export only:
 * nvoke never sends.
 */
export const OpenerStatus = z.enum(['queued', 'done', 'none', 'failed']);
export type OpenerStatus = z.infer<typeof OpenerStatus>;

export const OPENER_MAX_LENGTH = 300;

export const Opener = z.object({
  status: OpenerStatus,
  /** The drafted first line, plain text with no merge tags. Set when `done`. */
  line: z.string().nullable(),
  /** The page of the company's own site the line's fact comes from. */
  sourceUrl: z.string().nullable(),
  /** The words on that page the line rests on, verbatim. */
  quote: z.string().nullable(),
  draftedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type Opener = z.infer<typeof Opener>;

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
  /** Null unless the desktop app took up a refused or JS-only site. */
  localCrawl: LocalCrawlStatus.nullable(),
  emails: z.array(Email),
  /** Null until openers are drafted for it (`POST /v1/searches/:id/openers`). Older local copies lack it. */
  opener: Opener.nullable().default(null),
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
  'opener',
] as const;

/** Companies one opener job sends to Claude together. */
export const OPENER_BATCH = 8;

/**
 * Drafts openers for the companies of a search that have at least one valid
 * email: the ones in `companyIds`, or all of them. Companies that already
 * have one (`done`) or are `queued` are left alone unless `redo` is set.
 */
export const DraftOpenersRequest = z.object({
  companyIds: z.array(z.uuid()).min(1).max(SEARCH_LIMIT_MAX).optional(),
  redo: z.boolean().default(false),
});
export type DraftOpenersRequest = z.infer<typeof DraftOpenersRequest>;
export type DraftOpenersInput = z.input<typeof DraftOpenersRequest>;

export const DraftOpenersResponse = z.object({
  /** Companies queued for an opener. They turn `done`, `none` or `failed` within a minute or two. */
  queued: z.number().int().nonnegative(),
  /** Asked for but left alone: no valid email, or an opener already there. */
  skipped: z.number().int().nonnegative(),
});
export type DraftOpenersResponse = z.infer<typeof DraftOpenersResponse>;

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
  'search_running',
  'kind_mismatch',
  'not_claimed',
  'database_unavailable',
  'source_unavailable',
  'ai_unavailable',
]);
export type LeadsErrorCode = z.infer<typeof LeadsErrorCode>;
