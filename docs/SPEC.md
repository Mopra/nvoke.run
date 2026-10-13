# nvoke v1 spec

nvoke is a lead finder sold to paying customers. A native desktop app (Electron) is the only product surface. The user starts a search, the backend on our VPS finds companies, crawls their websites, extracts email addresses and checks that they can receive mail. The user browses, filters and exports the results.

## Search kinds

| kind | user gives | where companies come from |
|---|---|---|
| `local` | niche + location, e.g. "dentists" + "Copenhagen" | OpenStreetMap: Nominatim to resolve the location to a bounding box, Overpass to find matching businesses (by tag and name) that have a `website`. Free, no key. |
| `web` | keyword, optional country | Brave Search API (`BRAVE_SEARCH_API_KEY`). Take result domains, drop big platforms (social networks, marketplaces, Wikipedia, news). |
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
3. `crawl`: fetch the homepage plus likely pages (contact, about, team, impressum, privacy, legal), max 8 pages and 2 MB per company. Respect robots.txt. Identify as `nvokebot/1.0 (+https://nvoke.run/bot)`. At most 1 request per second per domain and a global concurrency cap. Extract emails from text, `mailto:` links, and simple obfuscations ("name [at] domain [dot] com"). Port and extend `../probe/apps/worker/src/contact/extract.ts`. Drop image filenames, placeholder addresses (example.com, sentry, wixpress, etc.) and addresses on unrelated domains unless they are the only ones found.
4. `verify`: per email, check syntax, MX records and disposable domain list, then an SMTP RCPT probe without sending (EHLO, MAIL FROM, RCPT TO, QUIT) with catch-all detection. If outbound port 25 is blocked on the VPS, fall back to MX-only and mark `verification = 'unknown'`. Cache results per address for 30 days. A `valid` result is charged against the user's plan in the same transaction (see "Plans"); every other result is free.
5. When all jobs for a search are finished, the search becomes `done` (or `failed` with an error).

Everything is a row in a Postgres `jobs` table claimed with `FOR UPDATE SKIP LOCKED`. No Redis. Retries use exponential backoff, max 3 attempts. The worker handles SIGTERM cleanly.

## Data model (Postgres, public schema, RLS enabled with no policies)

- `accounts`: `clerk_user_id` pk, `plan` (a key from `packages/shared/src/plans.ts`, default `free_user`), `plan_synced_at` (last read from Clerk Billing), `created_at`. Created on first authenticated request.
- `searches`: `id` uuid, `clerk_user_id`, `kind`, `params` jsonb, `limit` int, `status` (`queued` | `running` | `done` | `failed` | `canceled`), `error`, counters (`companies_found`, `companies_crawled`, `emails_found`, `emails_valid`), `created_at`, `started_at`, `finished_at`.
- `companies`: `id`, `search_id`, `clerk_user_id`, `name`, `domain`, `website`, `source`, `source_ref`, `location`, `phone`, `category`, `crawl_status` (`pending` | `done` | `failed` | `blocked`), `crawled_at`. Unique `(search_id, domain)`.
- `emails`: `id`, `company_id`, `search_id`, `clerk_user_id`, `address` (lowercase), `kind` (`generic` like info@/contact@, or `personal`), `source_url`, `verification` (`valid` | `invalid` | `risky` | `catch_all` | `unknown`), `checked_at`. Unique `(company_id, address)`.
- `email_checks`: cache keyed by `address`, with `verification`, `mx_host`, `checked_at`.
- `usage`: `clerk_user_id`, `period` (yyyy-mm), `emails_verified`.
- `billed_emails`: `clerk_user_id`, `address`, `period`, `billed_at`. Primary key `(clerk_user_id, address)`: every address a user was ever charged for.
- `jobs`: `id`, `type` (`find` | `crawl` | `verify`), `payload` jsonb, `status`, `attempts`, `run_after`, `locked_at`, `last_error`.

Auth tables (`device_sessions`, `desktop_auth_codes`) are owned by the auth work.

## API (Fastify, all under `/v1`, all require an authenticated user)

- `POST /v1/searches` with `{ kind, params, limit? }` returns the search.
- `GET /v1/searches` returns the user's searches, newest first.
- `GET /v1/searches/:id` returns one search with counters.
- `POST /v1/searches/:id/cancel`
- `DELETE /v1/searches/:id` deletes it with its companies and emails.
- `GET /v1/searches/:id/companies?cursor=&verification=&kind=&q=` returns companies with their emails, paginated.
- `GET /v1/searches/:id/export.csv` returns one row per email: company, domain, website, email, kind, verification, source_url, location, phone.
- `GET /v1/me` returns user, plan and usage for this period. `?sync=1` re-reads the plan from Clerk Billing first.

Outside `/v1`: `POST /webhooks/clerk` takes Clerk Billing events (signed with `CLERK_WEBHOOK_SIGNING_SECRET`) and re-reads the paying user's plan.

Request and response shapes live as zod schemas in `packages/shared/src/leads.ts` and are the single source of truth for server and desktop. The desktop polls `GET /v1/searches/:id` every 2 seconds while a search is running.

## Plans

One product for everyone. Every feature is on every plan; a plan is only a monthly allowance of verified emails. The ladder lives in `packages/shared/src/plans.ts` and is shared by the server, the site and the desktop app:

| Plan key (Clerk slug) | Verified emails a month | USD a month |
|---|---|---|
| `free_user` | 50 | 0 |
| `emails_1000` | 1,000 | 5 |
| `emails_2500` | 2,500 | 9 |
| `emails_7500` | 7,500 | 19 |
| `emails_20000` | 20,000 | 39 |
| `emails_50000` | 50,000 | 79 |
| `emails_100000` | 100,000 | 149 |

- A verified email is an address whose check came back `valid`, generic or personal. Invalid, risky, catch-all and unknown results are free.
- An address the user was charged for before is never charged again (`billed_emails`), in any month.
- Crawling stores addresses for free, but an address is only returned by the API and the CSV once its check has run. A valid address that no longer fits the allowance stays unchecked and hidden.
- When the allowance is used up, the search stops with status `failed` and error `quota_exceeded`, and new searches are refused with 403. No overage is ever charged. Usage resets each calendar month (UTC); nothing rolls over.
- Plans are Clerk Billing user plans. Checkout and cancel happen on the site at `/desktop/billing`, which the desktop app opens in the browser. The server reads the held plan with the Clerk Backend API (`billing.getUserBillingSubscription`): on `GET /v1/me` when the stored plan is older than 5 minutes, on `?sync=1`, and on every billing webhook. Active and past due items count, a canceled item counts until its period ends, and the most generous plan wins. A slug Clerk reports that the catalog does not know is logged as an error and never drops the user to Free.

## Desktop screens

- **Searches** (home): list with status, counters and progress. A "New search" button.
- **New search**: three tabs (Local businesses, Web search, New launches) with the fields above and a limit.
- **Search results**: table of companies with their emails and verification badges. Filter by verification and email kind, text search, copy email, open website, export CSV (saved via a native save dialog).
- **Account**: user, plan, verified email meter, sign out, and Upgrade or Manage billing, which opens `/desktop/billing` on the site.

## Website (nvoke.run)

Landing page that sells the native app ("a lead finder that lives on your desktop"), pricing (one slider over the plan ladder, no feature grid), a `/desktop/billing` page for checkout, download page (Windows, macOS, Linux from the latest GitHub Release), `/bot` page explaining nvokebot and how to opt out, privacy and terms pages.

## Compliance

Only collect publicly published business addresses. Honor robots.txt and an opt-out list (`crawl_optouts` by domain, fed from the `/bot` page later). Never send email from nvoke in v1.
