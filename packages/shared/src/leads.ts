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
export const SearchKind = z.enum(['local', 'web', 'launches', 'domains', 'drop', 'icp']);
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
/** The highest search limit on any plan. Each plan's own is `PLANS[plan].maxSearchLimit`. */
export const SEARCH_LIMIT_MAX = 25_000;

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

/**
 * "Describe your customer": who the user sells to in plain words. nvoke plans
 * the queries (docs/SPEC.md, "Describe your customer"), mines agency
 * directories and list pages, and keeps the companies that fit.
 */
export const IcpSearchParams = z.object({
  /** Who they sell to, in plain words. */
  description: text(2000),
  /** What the user sells, so the plan can tell a buyer from a competitor. */
  product: text(1000).optional(),
  /** Where to look, ISO 3166-1 alpha-2. Empty or absent: the planner picks. */
  countries: z.array(country).max(30).optional(),
  /** Cities or regions to favour, for customers that are local businesses. */
  locations: z.array(text(200)).max(30).optional(),
});
export type IcpSearchParams = z.infer<typeof IcpSearchParams>;
const limit = z.number().int().min(1).max(SEARCH_LIMIT_MAX).optional();
/**
 * Check the search's shared inboxes (info@, sales@) too. Off by default:
 * they reach no person, so they stay unchecked, hidden and free.
 */
const checkInboxes = z.boolean().optional();

export const CreateSearchRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('local'), params: LocalSearchParams, limit, checkInboxes }),
  z.object({ kind: z.literal('web'), params: WebSearchParams, limit, checkInboxes }),
  z.object({ kind: z.literal('launches'), params: LaunchesSearchParams, limit, checkInboxes }),
  /** `limit` defaults to the number of items; a smaller one takes the first ones. */
  z.object({ kind: z.literal('domains'), params: DomainsSearchParams, limit, checkInboxes }),
  z.object({ kind: z.literal('icp'), params: IcpSearchParams, limit, checkInboxes }),
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

/**
 * `PATCH /v1/searches/:id`, at least one field. ongoing: keep finding new
 * companies after the search ends, a few a day, until it is switched off.
 * Only plain words (`icp`) searches can be ongoing. checkInboxes: check the
 * search's shared inboxes (info@, sales@) too, any kind; on queues the ones
 * it left unchecked, off only stops future checks.
 */
export const UpdateSearchRequest = z
  .object({
    ongoing: z.boolean().optional(),
    checkInboxes: z.boolean().optional(),
  })
  .refine((r) => r.ongoing !== undefined || r.checkInboxes !== undefined, { message: 'Send ongoing, checkInboxes or both.' });
export type UpdateSearchRequest = z.infer<typeof UpdateSearchRequest>;

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
  /** What the search is doing now, for example `widen_geo`. Absent on kinds that do not report it. */
  stage: z.string().nullish(),
  /** The live progress line for people, for example "Looking in 12 more cities". */
  stageNote: z.string().nullish(),
  /** Keeps finding new companies after the first run ends. */
  ongoing: z.boolean().nullish(),
  /** Checks shared inboxes (info@, sales@) too. Off by default. */
  checkInboxes: z.boolean().nullish(),
  /**
   * Shared inboxes left unchecked because the switch is off, at companies
   * with no valid personal address: what switching it on would check.
   * Absent on readers that do not count them.
   */
  inboxesSkipped: z.number().int().nonnegative().nullish(),
  /** Shared inboxes queued or waiting for their check. */
  inboxesPending: z.number().int().nonnegative().nullish(),
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
        /**
         * Who started the run. Absent: the user (the first run or Search
         * more). `escalate`: nvoke, because a plain words search came up
         * short. `ongoing`: nvoke's daily run of an ongoing search.
         */
        trigger: z.enum(['escalate', 'ongoing']).optional(),
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
  SearchBase.extend({ kind: z.literal('icp'), params: IcpSearchParams, runs: runs(IcpSearchParams) }),
]);
export type Search = z.infer<typeof Search>;

export const SearchListResponse = z.object({
  searches: z.array(Search),
});
export type SearchListResponse = z.infer<typeof SearchListResponse>;

/**
 * How senior a person is, from their title. founder: founder, owner, CEO,
 * managing director, partner. executive: other C level, VP. director: head
 * of, director. The first three are decision makers.
 */
export const Seniority = z.enum(['founder', 'executive', 'director', 'manager', 'staff']);
export type Seniority = z.infer<typeof Seniority>;

export const DECISION_MAKERS: readonly Seniority[] = ['founder', 'executive', 'director'];

export function isDecisionMaker(seniority: Seniority | null | undefined): boolean {
  return seniority != null && DECISION_MAKERS.includes(seniority);
}

/** The person an address belongs to, when nvoke knows. */
export const Person = z.object({
  firstName: z.string(),
  lastName: z.string(),
  title: z.string().nullable(),
  seniority: Seniority.nullable(),
});
export type Person = z.infer<typeof Person>;

/**
 * page: printed on the company's site. pattern: built from the domain's
 * address pattern for a named person and accepted by the mail server.
 * cache: from the shared crawl cache of an earlier search.
 */
export const FoundVia = z.enum(['page', 'pattern', 'cache']);
export type FoundVia = z.infer<typeof FoundVia>;

export const Email = z.object({
  id: z.uuid(),
  address: z.string(),
  kind: EmailKind,
  sourceUrl: z.string().nullable(),
  /** Null until the address has been checked. */
  verification: Verification.nullable(),
  checkedAt: z.iso.datetime({ offset: true }).nullable(),
  /** Who the address reaches. Absent for role inboxes and older copies. */
  person: Person.nullish(),
  foundVia: FoundVia.nullish(),
  /** 0 to 100: how sure nvoke is the address reaches a real person or inbox. */
  confidence: z.number().int().min(0).max(100).nullish(),
});
export type Email = z.infer<typeof Email>;

/**
 * A drafted opener: `queued` while Claude writes it, `done` with a line,
 * `none` when the company's pages hold no fact to build on (or were never
 * read), `failed` when Claude could not answer. For copy and export, and
 * as context when a campaign writes the first email.
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
  /** 0 to 100: how well the company fits the search, judged from its own words. Absent when not scored. */
  fit: z.number().int().min(0).max(100).nullish(),
  /** Null until openers are drafted for it (`POST /v1/searches/:id/openers`). Older local copies lack it. */
  opener: Opener.nullable().default(null),
  /** Shared inboxes left unchecked while the search's switch is off, as `Search.inboxesSkipped` counts them. */
  inboxesSkipped: z.number().int().nonnegative().nullish(),
  /** Shared inboxes queued or waiting for their check: hidden until it settles. */
  inboxesPending: z.number().int().nonnegative().nullish(),
});
export type Company = z.infer<typeof Company>;

/** A yes or no in a query string: `true`, `false`, `1`, `0` (and a plain boolean from code). */
const queryFlag = z.union([z.boolean(), z.stringbool()]);

/**
 * Filters shared by the company list and the CSV export. With `verification`,
 * `kind`, `people` or `decisionMakers` set, only companies with a matching
 * email are returned, only the matching emails, and `total` counts those
 * companies. `people`: addresses with a named person. `decisionMakers`:
 * named people whose seniority is founder, executive or director.
 * `q` matches company name, domain or email address.
 */
export const LeadFilters = z.object({
  verification: Verification.optional(),
  kind: EmailKind.optional(),
  people: queryFlag.optional(),
  decisionMakers: queryFlag.optional(),
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
  'first_name',
  'last_name',
  'title',
  'seniority',
  'kind',
  'verification',
  'source_url',
  'found_via',
  'confidence',
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
  /** Highest `limit` a single search may ask for on this plan. */
  maxSearchLimit: z.number().int().positive(),
  /** Highest `dailyLimit` a drop may have on this plan. */
  maxDropDailyLimit: z.number().int().positive(),
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
  'ongoing_not_supported',
  'search_canceled',
  'not_claimed',
  'database_unavailable',
  'source_unavailable',
  'ai_unavailable',
]);
export type LeadsErrorCode = z.infer<typeof LeadsErrorCode>;
