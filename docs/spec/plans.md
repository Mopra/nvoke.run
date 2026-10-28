# Plans

One product for everyone. Every feature is on every plan; a plan is only a monthly allowance of verified emails. The ladder lives in `packages/shared/src/plans.ts` and is shared by the server, the site and the desktop app:

| Plan key (Clerk slug) | Verified emails a month | USD a month | Companies a search | Companies a drop a day |
|---|---|---|---|---|
| `free` | 50 | 0 | 1,000 | 200 |
| `emails_1000` | 1,000 | 9 | 2,500 | 250 |
| `emails_2500` | 2,500 | 19 | 5,000 | 500 |
| `emails_10000` | 10,000 | 49 | 10,000 | 1,000 |
| `emails_25000` | 25,000 | 99 | 20,000 | 2,500 |
| `emails_60000` | 60,000 | 199 | 25,000 | 5,000 |

- The search and drop limits are not a price lever, they keep one job a sane size. They grow with the allowance so a paying user can spend it in a few searches (a search aims for about 30% of its companies as verified emails), and stop at 25,000 (`SEARCH_LIMIT_MAX`) and 5,000 (`DROP_DAILY_LIMIT_MAX`). The API holds a bigger `limit` or `dailyLimit` to the plan's without an error; `GET /v1/me` returns both as `maxSearchLimit` and `maxDropDailyLimit`.
- Capacity: verification is the ceiling, not these limits. Mail servers without IPv6 (Microsoft 365, most shared hosting) are probed over IPv4, held to `SMTP_PROBES_PER_MINUTE` (5) sessions a minute from the one VPS, of which the free tools take 1. That is about 5,760 worker sessions a day, roughly 86,000 verified emails a month for every user together, while the top plan alone allows 60,000. IPv6 sessions are far less limited. That is a good problem (it only bites once people pay), and the plan to raise it is `docs/research/smtp-throughput.md`.

- A verified email is an address whose check came back `valid`, generic or personal. Invalid, risky, catch-all and unknown results are free.
- A valid email found by a Sonar (`icp`) search counts as three against the allowance (`ICP_EMAIL_WEIGHT`, `emailWeight(kind)` in `plans.ts`). That search pays for Claude on every company and for web search, so its leads cost more to make. Every other kind counts one. The site's pricing page, billing and the ICP forms say so in one line.
- An address the user was charged for is not charged again while its `billed_emails` row exists, which is 12 months (see [Privacy](privacy.md), retention).
- Crawling stores addresses for free, but an address is only returned by the API and the CSV once its check has run. A valid address that no longer fits the allowance stays unchecked and hidden.
- When the allowance is used up, the search stops with status `failed` and error `quota_exceeded`, and new searches are refused with 403 `{ error: 'quota_exceeded', billingUrl }`. No overage is ever charged. Usage resets each calendar month (UTC); nothing rolls over.
- Plans are Clerk Billing user plans. Checkout and cancel happen on the site at `/desktop/billing`, which the desktop app opens in the browser, and at `/app/billing` inside the web app (the same component). The server reads the held plan with the Clerk Backend API (`billing.getUserBillingSubscription`): on `GET /v1/me` when the stored plan is older than 5 minutes, on `?sync=1`, and on every billing webhook. Active and past due items count, a canceled item counts until its period ends, and the most generous plan wins. A slug Clerk reports that the catalog does not know is logged as an error and never drops the user to Free.
- A plan can be granted by hand: set `publicMetadata.plan` to a plan key on the user in the Clerk dashboard. It counts like an active subscription, so a paid plan above it still wins.
