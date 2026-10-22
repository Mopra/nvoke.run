# Company seed

Phase 2, item 8 of `cost-per-lead.md`: make the company index the main
source, so a Sonar (`icp`) search asks data we hold before it pays for web
search. The index (`apps/server/src/leads/company-index.ts`) reads
`domain_pages` (the text of up to 3 pages a crawl read) joined to `domains`
(the last crawl's outcome), and `feed_items`. Until now only domains a
search had already crawled were in it, so it served 3 of 1,852 Sonar
companies in 30 days (`cli stats --prod`, 2026-10-22). The seed fills it
from a free list of company domains.

## Source

**Majestic Million**, `https://downloads.majestic.com/majestic_million.csv`.

- Free, rebuilt daily at the same address, a plain CSV (no archive), about
  80 MB, one registrable domain per row ranked by referring subnets.
- Licence: Creative Commons Attribution 3.0 Unported. Commercial use is
  allowed; credit Majestic (https://majestic.com/reports/majestic-million)
  wherever we describe where the seed comes from. We store domain names
  only, never their link counts.

Turned down:

- **Tranco** (`tranco-list.eu/top-1m.csv.zip`): the default list folds in
  Cloudflare Radar, which is CC BY-NC 4.0, so no commercial use. A custom
  list without it needs an account and a new list id each time.
- **Common Crawl web graph ranks** (host or domain level, harmonic
  centrality): free under the Common Crawl terms of use and deeper in the
  long tail of small companies, but gigabytes per release at a new address
  each quarter. The parser reads them, so an operator who downloaded one can
  import it with `cli seed file <path>`.

The head of any popularity list is platforms, CDNs and media, so `majestic`
passes over ranks 1 to 10,000 by default (`--skip`).

## How it works

`apps/server/src/leads/seed/`:

- `sources.ts`: the list and its parser (Majestic CSV, Common Crawl ranks,
  `rank,domain`, one domain per line).
- `filter.ts`: leaves out platforms, webmail and directories (the crawl
  rules' own lists), CDN, ad, tracking and cloud hosts, government,
  universities, the military and adult sites.
- `import.ts`: adds a batch to `seed_domains` (migration
  `1830_company_seed`), leaving out suppressed domains, domains a crawl
  already holds and domains already queued.
- `tick.ts`: the worker's seed loop. Every minute it crawls a few queued
  domains, best rank first, with the pipeline's crawler (robots.txt on every
  hop, one request per second per host, 4 pages) and records the crawl in
  the shared crawl cache, pages included, which is what the index reads.

It stays out of users' way:

- At most `SEED_DAILY_DOMAINS` crawls in any 24 hours, spread evenly over
  the day (2,000 a day is 2 a minute), 12 a minute at most.
- No crawl while a user's find, crawl or fit job waits in the queue.
- Its own loop, not a job, so the runner's slots stay with searches.
- No email is verified, so SMTP pacing is untouched.
- The seeded domain is due for a recrawl at once (`recheck_at` equals
  `crawled_at`): a search that picks it crawls it in full, with the people
  step, rather than reading the seed's 4 pages from the cache. The pages
  stay in the index for 12 months (the retention of `domains` rows).

## Demand

The queue is crawled by what users search for, not by popularity alone
(`seed/demand.ts`, migration `1840_seed_demand`). Before its crawl a seed
domain is only a name, so its `score` reads the name:

- A word of a Sonar plan of the last 30 days inside the name before the
  first dot ("church" in `gracechurch.org`, "agency" in
  `outboundagency.co.uk`). Words come from the plan's segments, core and
  adjacent queries, stemmed, without generic ones ("company", "small") and
  shorter than 4 letters. Each matched word weighs the share of recent plans
  that hold it, shrunk when the word is in more than 200 queued names
  ("book" is in 3,847, "baptist" in 80), up to 2 in all, times 2.
- The TLD of a plan's country (.nl, .uk for gb), weighed the same way.
  Countries whose ccTLD is used as a generic one (.io, .co) count nothing.

Each plan counts the same, however many queries it holds. Every hour the
loop reads the recent plans and, when they or the imports changed, rescores the queued
domains. The claim takes the highest score first and the list's rank after
it, so without recent plans the order is the rank, as before. Import deep
(the whole list): the score can only pick from what is queued.

## Turn it on

```bash
pnpm --filter @nvoke/server cli seed majestic --limit 20000 --prod
# then in /opt/nvoke/.env, and restart nvoke-worker
SEED_DAILY_DOMAINS=10000
```

`cli seed` prints what it read, filtered and added, and the queue. Run it
again with a higher `--limit` (already queued domains are passed over) or a
higher `--skip` to go deeper in the list.

## Expected effect

Not measured yet; judge it by `cli stats`, "companies from the company
index" per kind and the cost per 1,000 valid emails. At 2,000 a day the
index gains about 60,000 companies a month. Fit scoring needs no fetch for
a seeded candidate (its homepage title and description are kept). How many
of them match a given Sonar plan depends on the niche: popular domains skew
to larger companies, so the seed helps most for broad B2B plans (agencies,
SaaS, consultancies) and least for local trades.
