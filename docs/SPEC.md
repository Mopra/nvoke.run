# nvoke v1 spec

nvoke is a lead finder sold to paying customers. A native desktop app (Electron) is the only product surface. The user starts a search, the backend on our VPS finds companies, crawls their websites, extracts email addresses and checks that they can receive mail. The user browses, filters and exports the results.

## Search kinds

| kind | user gives | where companies come from |
|---|---|---|
| `local` | niche + location, e.g. "dentists" + "Copenhagen" | OpenStreetMap: Nominatim to resolve the location to a bounding box, Overpass to find matching businesses (by tag and name) that have a `website`. Free, no key. |
| `web` | keyword, optional country | Brave Search API (`BRAVE_SEARCH_API_KEY`). Take result domains, drop big platforms (social networks, marketplaces, Wikipedia, news). Paid per request, see "Source costs". |
| `launches` | optional keyword filter, time window | Product Hunt and Hacker News "Show HN" (port from `../probe/apps/worker/src/sources`). |

Each source is an adapter with the same interface, so more can be added later:

```ts
interface SourceAdapter<P> {
  kind: SearchKind
  find(params: P, ctx: { limit: number; signal: AbortSignal; log: Logger }): AsyncIterable<FoundCompany>
}
type FoundCompany = { name: string; website: string; source: string; sourceRef?: string; location?: string; phone?: string; category?: string }
```

## Pipeline per search

1. API inserts a `searches` row (`queued`) and a `find` job.
2. Worker runs the source adapter, inserts `companies` rows (deduped per search by normalized domain), and enqueues one `crawl` job per company. It stops at the search's `limit` (default 100, at most 1,000 on every plan).
3. `crawl`: skip the company if its domain is suppressed (see "Privacy"). Otherwise check the shared cache (`domains`): a fresh row (`recheck_at` in the future) is reused when the last crawl found no personal addresses, or when it failed or was blocked. Reuse copies the domain's cached generic addresses (`domain_emails`) into this search's `emails`, minus suppressed ones, without fetching anything. In every other case crawl again: fetch the homepage plus likely pages (contact, about, team, impressum, privacy, legal), max 8 pages and 2 MB per company. Respect robots.txt. Identify as `nvokebot/1.0 (+https://nvoke.run/bot)`. At most 1 request per second per domain and a global concurrency cap. Extract emails from text, `mailto:` links, and simple obfuscations ("name [at] domain [dot] com"). Port and extend `../probe/apps/worker/src/contact/extract.ts`. Drop image filenames, placeholder addresses (example.com, sentry, wixpress, etc.) and addresses on unrelated domains unless they are the only ones found. Classify each address `generic` (role mailbox) or `personal` (always for webmail such as gmail.com). Then drop suppressed addresses, store all remaining addresses in this search's `emails`, upsert the `domains` row (`recheck_at` 90 days after a crawl, 7 days after a failed or blocked one, `has_personal` set when personal addresses were found), upsert the generic addresses into `domain_emails` (`first_seen` never changes, `last_seen` moves to now) and delete the domain's cached addresses this crawl no longer found. Personal addresses never go into the shared cache.
4. `verify`: per email, check syntax, MX records and disposable domain list, then an SMTP RCPT probe without sending (EHLO, MAIL FROM, RCPT TO, QUIT) with catch-all detection. If outbound port 25 is blocked on the VPS, fall back to MX-only and mark `verification = 'unknown'`. Cache results per address for 30 days. A `valid` result is charged against the user's plan in the same transaction (see "Plans"); every other result is free.
   Cached addresses go through the same verify step and count toward the quota the same way: a user pays per valid verification, wherever the address came from.
5. When all jobs for a search are finished, the search becomes `done` (or `failed` with an error).

Everything is a row in a Postgres `jobs` table claimed with `FOR UPDATE SKIP LOCKED`. No Redis. Retries use exponential backoff, max 3 attempts. The worker handles SIGTERM cleanly. The worker also runs the retention purge (`apps/server/src/leads/retention.ts`) at start and then hourly (see "Privacy").

## Data model (Postgres, public schema, RLS enabled with no policies)

- `accounts`: `clerk_user_id` pk, `plan` (a key from `packages/shared/src/plans.ts`, default `free`), `plan_synced_at` (last read from Clerk Billing), `created_at`. Created on first authenticated request.
- `searches`: `id` uuid, `clerk_user_id`, `kind`, `params` jsonb, `limit` int, `status` (`queued` | `running` | `done` | `failed` | `canceled`), `error`, counters (`companies_found`, `companies_crawled`, `emails_found`, `emails_valid`, and `source_requests` and `source_cache_hits` from "Source costs"), `created_at`, `started_at`, `finished_at`.
- `companies`: `id`, `search_id`, `clerk_user_id`, `name`, `domain`, `website`, `source`, `source_ref`, `location`, `phone`, `category`, `crawl_status` (`pending` | `done` | `failed` | `blocked`), `crawled_at`. Unique `(search_id, domain)`.
- `emails`: `id`, `company_id`, `search_id`, `clerk_user_id`, `address` (lowercase), `kind` (`generic` like info@/contact@, or `personal`), `source_url`, `verification` (`valid` | `invalid` | `risky` | `catch_all` | `unknown`), `checked_at`. Unique `(company_id, address)`.
- `email_checks`: cache keyed by `address`, with `verification`, `mx_host`, `checked_at`.
- `usage`: `clerk_user_id`, `period` (yyyy-mm), `emails_verified`.
- `billed_emails`: `clerk_user_id`, `address`, `period`, `billed_at`. Primary key `(clerk_user_id, address)`: every address a user was ever charged for.
- `domains`: shared crawl cache, one row per domain: `domain` pk (lowercase), `crawl_status` (`done` | `failed` | `blocked`), `crawled_at`, `has_personal` (the last crawl found personal addresses, which are not cached), `recheck_at` (after this the next search that finds the domain crawls it again).
- `domain_emails`: generic addresses only, shared across users: `domain` (fk to `domains`, cascade), `address` (lowercase), `source_url`, `first_seen` (fixed at first collection, drives retention), `last_seen`. Primary key `(domain, address)`.
- `suppressions`: opted-out addresses and domains, stored only as `hash` pk (sha256 hex of the lowercased address, or of `'domain:' || registrable domain`), `kind` (`address` | `domain`), `source` (`opt_out_page` | `email` | `bot_page` | `admin`), `created_at`. Kept forever. Code in `apps/server/src/leads/suppression.ts`.
- `web_search_cache`: Brave result pages keyed by `(query, country, page)`: `companies` jsonb (name, website, result URL only, never the raw response), `more` (Brave has a next page), `fetched_at`.
- `jobs`: `id`, `type` (`find` | `crawl` | `verify`), `payload` jsonb, `status`, `attempts`, `run_after`, `locked_at`, `last_error`.

Auth tables (`device_sessions`, `desktop_auth_codes`) are owned by the auth work.

## API (Fastify, all under `/v1`, all require an authenticated user unless marked public)

- `POST /v1/searches` with `{ kind, params, limit? }` returns the search.
- `GET /v1/searches` returns the user's searches, newest first.
- `GET /v1/searches/:id` returns one search with counters.
- `POST /v1/searches/:id/cancel`
- `DELETE /v1/searches/:id` deletes it with its companies and emails.
- `GET /v1/searches/:id/companies?cursor=&verification=&kind=&q=` returns companies with their emails, paginated.
- `GET /v1/searches/:id/export.csv` returns one row per email: company, domain, website, email, kind, verification, source_url, location, phone.
- `GET /v1/me` returns user, plan and usage for this period. `?sync=1` re-reads the plan from Clerk Billing first.

- `POST /v1/privacy/opt-out` (public, rate limited) with `{ email }` or `{ domain }` suppresses it at once and deletes matching data. No confirmation step. Always returns `{ ok: true }`, so it cannot be used to test whether nvoke holds an address. Schema in `packages/shared/src/privacy.ts`.

Outside `/v1`: `POST /webhooks/clerk` takes Clerk Billing events (signed with `CLERK_WEBHOOK_SIGNING_SECRET`) and re-reads the paying user's plan.

Request and response shapes live as zod schemas in `packages/shared/src/leads.ts` and are the single source of truth for server and desktop. The desktop polls `GET /v1/searches/:id` every 2 seconds while a search is running.

## Plans

One product for everyone. Every feature is on every plan; a plan is only a monthly allowance of verified emails. The ladder lives in `packages/shared/src/plans.ts` and is shared by the server, the site and the desktop app:

| Plan key (Clerk slug) | Verified emails a month | USD a month |
|---|---|---|
| `free` | 50 | 0 |
| `emails_1000` | 1,000 | 5 |
| `emails_2500` | 2,500 | 9 |
| `emails_7500` | 7,500 | 19 |
| `emails_20000` | 20,000 | 39 |
| `emails_50000` | 50,000 | 79 |
| `emails_100000` | 100,000 | 149 |

- A verified email is an address whose check came back `valid`, generic or personal. Invalid, risky, catch-all and unknown results are free.
- An address the user was charged for is not charged again while its `billed_emails` row exists, which is 12 months (see "Privacy", retention).
- Crawling stores addresses for free, but an address is only returned by the API and the CSV once its check has run. A valid address that no longer fits the allowance stays unchecked and hidden.
- When the allowance is used up, the search stops with status `failed` and error `quota_exceeded`, and new searches are refused with 403. No overage is ever charged. Usage resets each calendar month (UTC); nothing rolls over.
- Plans are Clerk Billing user plans. Checkout and cancel happen on the site at `/desktop/billing`, which the desktop app opens in the browser. The server reads the held plan with the Clerk Backend API (`billing.getUserBillingSubscription`): on `GET /v1/me` when the stored plan is older than 5 minutes, on `?sync=1`, and on every billing webhook. Active and past due items count, a canceled item counts until its period ends, and the most generous plan wins. A slug Clerk reports that the catalog does not know is logged as an error and never drops the user to Free.

## Source costs

Brave Search bills every request, while users pay only for valid emails. A web search that finds nothing still costs requests, so the find job keeps that cost down:

- **Stop early.** The adapter fetches one page (20 results) at a time and the find job stops pulling as soon as the search has `limit` companies, so a search never fetches pages it does not use. At most 10 pages per search.
- **Cache.** Every page is stored in `web_search_cache` by normalized query (trimmed, lowercased, single spaced), country and page, and reused by any search for 7 days (`RETENTION.webSearchCacheDays`). A cache read or write that fails never fails the search.
- **Rate.** `BRAVE_REQUESTS_PER_SECOND` (default 1, the free plan) sets the shared rate limit, with a tenth of headroom.
- **Measure.** Each search counts its paid requests (`source_requests`) and pages served from the cache (`source_cache_hits`). `cli stats --days 30 --prod` on the VPS prints them per kind next to valid emails, with valid emails per paid request.

## Desktop screens

- **Searches** (home): list with status, counters and progress. A "New search" button.
- **New search**: three tabs (Local businesses, Web search, New launches) with the fields above and a limit.
- **Search results**: table of companies with their emails and verification badges. Filter by verification and email kind, text search, copy email, open website, export CSV (saved via a native save dialog).
- **Account**: user, plan, verified email meter, sign out, and Upgrade or Manage billing, which opens `/desktop/billing` on the site.

## Website (nvoke.run)

Landing page that sells the native app ("a lead finder that lives on your desktop"), pricing (one slider over the plan ladder, no feature grid), a `/desktop/billing` page for checkout, download page (Windows, macOS, Linux from the latest GitHub Release), `/bot` page explaining nvokebot and how to block or opt out, `/opt-out` (address or whole domain, calls `POST /v1/privacy/opt-out`), `/privacy` in Danish and English including the Article 14 notice for people whose addresses we collect, and `/terms` with the customer duties listed under "Privacy".

## Privacy

Full documents: `docs/legal/` (`lia.md` legitimate interest assessment, `dpia.md`, `ropa.md` record of processing, `article-14.md`, `lawyer-brief.md` with the open questions). Background research: `docs/research/gdpr-competitors.md`. Rights requests: `deploy/PRIVACY-RUNBOOK.md`.

- **Positioning.** nvoke is a prospecting research tool, never a "cold email" tool. In Denmark, Markedsføringsloven §10 requires prior consent for marketing email to anyone, B2B, info@ and employees included. Customers are bound to it by the terms. nvoke itself never sends email.
- **Roles and basis.** nvoke is controller for collection, classification, verification, the shared cache and the suppression list, on legitimate interest (Art 6(1)(f)). The customer is an independent controller for its own use of what it views and exports.
- **Collection.** Only addresses published on the company's own public pages, within the crawl limits in the pipeline. robots.txt honoured, no logins, no CAPTCHA solving, named user agent linking to `/bot`. No names, titles or social profiles are extracted.
- **Split cache.** Only generic addresses are shared between users (`domain_emails`). Personal addresses exist only in the `emails` of the search that found them and are deleted with it.
- **Suppression.** `suppressions` is checked before storing a crawl result, before serving from the cache and before export. An opt-out or erasure (`apps/server/src/privacy/erase.ts`) suppresses first, then deletes every stored copy: `emails`, `domain_emails`, `domains`, `email_checks`, `billed_emails` and, for a domain, the companies found on it (subdomains included). Shared mailbox domains such as gmail.com cannot be suppressed as a whole from the public page. Sources: the public `/opt-out` page and API, the `/bot` page, privacy@nvoke.run, and admin (`cli privacy suppress-domain`).
- **Retention**, enforced by `purge()` in the worker (hourly):
  - `domain_emails`: deleted 12 months after `first_seen` (never reset by a new search or recrawl), and as soon as a recrawl no longer finds the address.
  - `searches` with their `companies` and `emails`: deleted 12 months after `created_at`, or earlier when the user deletes the search.
  - `email_checks`: 30 days.
  - `web_search_cache`: 7 days after `fetched_at`.
  - `billed_emails`: 12 months after `billed_at`. Finding the address again after that charges it again.
  - `domains`: dropped 12 months after `recheck_at` when no search crawled the domain again.
  - `suppressions`: forever, so an opted-out address is never collected again.
- **Transparency.** Article 14 notice on `/privacy` (Danish and English). No individual notification today; whether personal addresses need one is open (`docs/legal/article-14.md`).
- **Rights.** Access, erasure and objection by email to privacy@nvoke.run, handled with `cli privacy export`, `cli privacy erase` and `cli privacy suppress-domain`. Access answers name the source URL of every address.
- **Open items** (details in `docs/legal/`): Article 14 for personal addresses, §10 co-liability, SMTP probes, source terms of use, whether `billed_emails` should hold hashes instead of plain addresses, Supabase region and VPS host. Webmail addresses (gmail.com and similar) are always classified personal and never cached.
