# Cost per 1,000 verified emails

Owner decision 2026-10-20: nvoke is a scraper and verifier, nothing more,
and it should get sharper and cheaper until the price disrupts. This page
asks what one verified email costs us today and which levers move it.

Every number below is an estimate from the code and the docs
(`crawl-benchmark.md`, `smtp-throughput.md`, `SPEC.md`). Nothing logs cost
per verified email yet. Measuring it is step one (see "Measure first").

## What we earn

Only `valid` results are charged (`packages/shared/src/plans.ts`).

A valid email from a Sonar (`icp`) search counts as three
(`ICP_EMAIL_WEIGHT`), so Sonar earns three times the price per 1,000 below.

| Plan | Price per 1,000 verified | Per 1,000 ICP valid |
| --- | --- | --- |
| `emails_1000` | $9.00 | $27.00 |
| `emails_2500` | $7.60 | $22.80 |
| `emails_10000` | $4.90 | $14.70 |
| `emails_25000` | $3.96 | $11.88 |
| `emails_60000` | $3.32 | $9.96 |

## Where the money goes

Two things cost money per email: Brave Search ($5 per 1,000 answered
requests, `BRAVE_COST_PER_1000_USD`) and Claude through OpenRouter (Haiku
5.5 for `fit` and `people`, Sonnet 5.5 for `plan` and `replan`). The crawl
and SMTP probes cost no money per email. They are capacity: port 25 on IPv4
is throttled to 5 sessions a minute, and that caps volume, not margin.

### Describe your customer (ICP), limit 150, cold caches

| Step | Per run | Per 1,000 verified (45 verified a run) |
| --- | --- | --- |
| Brave, 17 to 24 requests (`SPEC.md`) | about $0.10 | about $2.20 |
| `plan`, Sonnet | about $0.02 | about $0.45 |
| `fit`, Haiku, about 15 calls | about $0.015 | about $0.35 |
| `people`, Haiku, about 75 pages of 8,000 chars | about $0.06 | about $1.30 |
| **Total** | **about $0.20** | **about $4.30** |

45 verified a run is the `VERIFIED_TARGET` ratio (30% of companies). Each
escalate round adds Brave requests and a Sonnet `replan`.

### Domains and local searches

- `domains` by company name: 1 Brave request per name, 62% of sites yield
  an email. Roughly 1.5 to 2.5 requests per verified email, so **$7 to $12
  per 1,000 verified** on Brave alone.
- `local`: places without a website cost 2.6 Brave requests per company
  with a correct email (`crawl-benchmark.md`), **about $13 per 1,000** for
  that half of the results. Places with a website cost almost nothing.

### What that means

On cold caches, the ICP estimate ($4.30) is about half of what the top plan
earns for an ICP email, but the measured ICP cost below ($20.72) is above
what even the cheapest plan earns for it ($18). `local` places without a
website cost about four times what the top plan earns. The shared caches
(`web_search_cache` for 7 days, the domain tables for 90 days, `email_checks`
for 7 to 30 days) are what make the margin today. How often they hit is
unknown.

To price below the market (say $1 per 1,000 verified or less), the marginal
cost has to drop below about $0.30 per 1,000. That only happens if most
emails come from data we already hold.

## Measured 2026-10-20 (production, last 30 days, before these changes)

`cli stats --prod`: **$20.72 per 1,000 valid** emails (web search $2.04 plus
pipeline Claude $0.95 for 144 valid). Brave was all of the search cost:

| Kind | Searches | Paid requests | Valid | Search $ per 1,000 valid |
| --- | --- | --- | --- | --- |
| icp | 2 | 371 | 97 | $19.12 |
| web | 9 | 34 | 14 | $12.14 |
| local | 4 | 2 | 11 | $0.91 |
| domains | 4 | 0 | 19 | $0.00 |

Claude: `fit` $0.55 (417 calls), `people` $0.26 (569 calls), `plan` and
`replan` $0.13. Brave cache hit rate 0%. A small sample, but the estimate
above ($4.30) was 5x too kind: an ICP search needs about 4 paid requests
per valid email (0.26 valid per request). The funnel after the search (fit,
crawl yield, verified share) matters as much as the price per request.

## Status 2026-10-20

Built: `cli stats` prints cost per 1,000 valid (`src/leads/cost-report.ts`);
`valid` checks cached 30 days; the company index searched before Brave in
ICP searches (lever 1, `src/leads/company-index.ts`); the free name to
website lookup before Brave in `domains` and `local`
(`src/leads/sources/resolve-name.ts`); a cheaper people step (lever 3);
Serper as primary or fallback beside Brave (`WEB_SEARCH_PROVIDER`,
`WEB_SEARCH_FALLBACK`), at $1.00 per 1,000 down to $0.30 at volume against
Brave's $5.

Not done: lever 2 for Brave pages. Brave's terms, section 3(b)(i), forbid
storing or caching results beyond transient storage, so the 7 day
`web_search_cache` is an open question for the lawyer
(`docs/legal/lawyer-brief.md`, item 7) and is not extended. Lever 4 waits on
the same review. Lever 5 costs money each month.

## Levers, biggest first

1. **Our own company index before Brave.** Every domain we crawl stays in
   `domains`, `domain_pages` and `domain_emails`. Make that a searchable
   index (category, country, description, size signals) and answer `icp`,
   `domains` and `local` from it first, calling Brave only for the gap.
   Seed it from Common Crawl's host index and the feed collectors, both
   free. This is Getlead's 900M contact database, built for us by our own
   traffic. It is the only lever that takes Brave from dollars to cents.
2. **Longer cache lives where the data is stable.** `web_search_cache` is 7
   days. Company websites and generic inboxes rarely change within a month,
   so 30 days cuts repeat Brave cost by up to 4x for popular queries.
   `email_checks` held `valid` for 7 days; it is 30 days since 2026-10-20,
   the whole retention, which saves SMTP sessions, the throughput
   bottleneck.
3. **Cheaper `people`.** It is the biggest Claude cost. Run the rule based
   people parser first and call Haiku only when it finds nothing on a page
   that looks like a team page. Trim the page text to the people section
   rather than 8,000 chars. Target: a third of today's calls.
4. **Recrawl personal domains less.** A domain with personal addresses is
   never served from cache (`domain-cache.ts:49`), so every search crawls it
   again. The reason is likely legal (holding personal data across users).
   Check against `docs/legal` before changing; a short shared cache of the
   page fetch alone, without the extracted people, may be enough.
5. **More port 25 capacity, not more API.** Paid verification APIs lose
   money at our prices (`smtp-throughput.md` section 10). Extra egress nodes
   at about $5 a month each lift the IPv4 ceiling for a fixed cost.

## Measure first

Before building any lever, log the real number per search:

- Brave requests and cache hits (`searches.source_requests`,
  `source_cache_hits`, already stored).
- Claude cost (`ai_usage`, already stored per user and task).
- SMTP sessions per verified email (not logged yet,
  `smtp-throughput.md:88`).

Then have `cli stats` print cost per 1,000 verified per search kind and the
cache hit rates. A month of production data gives the real cold versus warm
numbers and shows which lever pays first. Reading production stats costs
nothing; no Brave or OpenRouter calls are needed for this.
