# Cost per 1,000 verified emails

Owner decision 2026-10-20: nvoke is a scraper and verifier, nothing more,
and it should get sharper and cheaper until the price disrupts. This page
asks what one verified email costs us today and which levers move it.

Every number below is an estimate from the code and the docs
(`crawl-benchmark.md`, `smtp-throughput.md`, `SPEC.md`). Nothing logs cost
per verified email yet. Measuring it is step one (see "Measure first").

## What we earn

Only `valid` results are charged (`packages/shared/src/plans.ts`).

| Plan | Price per 1,000 verified |
| --- | --- |
| `emails_1000` | $5.00 |
| `emails_7500` | $2.53 |
| `emails_20000` | $1.95 |
| `emails_100000` | $1.49 |

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

On cold caches, Brave plus Haiku costs about as much as the cheapest plan
earns, and two to eight times what the top plan earns. The shared caches
(`web_search_cache` for 7 days, the domain tables for 90 days, `email_checks`
for 7 to 30 days) are what make the margin today. How often they hit is
unknown.

To price below the market (say $1 per 1,000 verified or less), the marginal
cost has to drop below about $0.30 per 1,000. That only happens if most
emails come from data we already hold.

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
