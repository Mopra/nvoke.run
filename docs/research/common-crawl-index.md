# Company index from Common Crawl

Explee claims a 105M company index. The seed tick (`company-seed.md`)
crawls 2,000 domains a day, so building anything that size ourselves would
take over a century. This test asks whether Common Crawl's free archives can
fill the index instead: one recent crawl, measured on a random sample of
its domains, then extrapolated to the whole crawl. Measured 2026-10-22 on
`CC-MAIN-2026-43` (crawled 5 to 18 October 2026). No paid API was used; the
business labels come from Claude subagents on the subscription.

## Verdict: go, homepage pass only, no LLM pass

One crawl holds about **11 million businesses** with a readable homepage,
**7 million** of them with an email on the pages Common Crawl kept, and
their title and description are enough for the fit gate three times in
four. That is 5,500 days of the seed tick, and the VPS can load it in two to
four weeks of background fetching at no extra cost. It is not 105M: no free
source gets there, and Explee's figure almost certainly counts domains, not
companies with a site worth reading.

Build it like this (follow-up quest "Company index: load Common Crawl
homepages"):

1. Read the crawl's 300 CDX index shards on the VPS, keep one homepage
   capture per registrable domain plus the best contact and about captures,
   and pass the list through the seed filter (`seed/filter.ts`).
2. Fetch the homepages by HTTP range, 4 at a time, and keep title,
   description and the start of the text in the index, with
   `isParkedPage`, `pageWall` and an empty-text check dropping the dead.
3. Do not classify the 20M homepages with an LLM. Non-businesses are 46% of
   rows, but the fit gate already drops them per search, and an LLM pass
   over all of them would cost thousands of dollars on OpenRouter.
4. Stack the previous crawl for the domains the latest one has no homepage
   for (adds about a quarter of them).

## Method

`apps/server/src/bench/common-crawl.ts`, three commands, no database:

```bash
cd apps/server
# 1. One whole index shard (download cdx-00150.gz first, 827 MB)
npx tsx --conditions=@nvoke/source src/bench/common-crawl.ts shard cdx-00150.gz
# 2. Random index blocks across all 300 shards, each domain in a block taken at 2 to 4%
npx tsx --conditions=@nvoke/source src/bench/common-crawl.ts sample --cluster cluster.idx --blocks 1500 --rate 0.04 --seed 2026 --out sample.jsonl
# 3. The domains with no homepage, looked up in the previous crawl
npx tsx --conditions=@nvoke/source src/bench/common-crawl.ts previous --crawl CC-MAIN-2026-39 --cluster cluster-39.idx --domains nohome.txt
```

The CDX index is sorted by host, so a block of 3,000 captures holds every
capture of the domains inside it: their homepage, their contact page and
their about page side by side. That makes a block a better unit than a WARC
file, which is a random time slice of the crawl and rarely holds two pages
of one site. `cluster.idx` gives the byte range of all 886,601 blocks, so a
sample spread over every TLD costs one range request a block.

For each sampled domain the script takes the homepage capture (the root on
the bare or `www` host, following a same site redirect when the target was
captured), the best contact page by `pageScore` and the best about page by
`peoplePageKind`, fetches those records by range from
`data.commoncrawl.org`, and runs the crawl rules on them: `pageText` for
title, description and text, `extractEmails` and `selectForCompany` for the
emails, `isParkedPage`, `looksJsOnly` and `pageWall`.

Samples (seeds 43, 2026 and 7): 818, 3,189 and 545 domains. The three agree
within a point on every rule based figure below. The first sample's 375
readable homepages were labelled by Claude (Sonnet subagents, four batches):
kind of site, B2B or B2C, and whether title and description alone, or with
the text, would let the fit gate judge the company.

## Size of one crawl

| | count | how |
|---|---|---|
| captures | 2.66B | 886,601 blocks of 3,000 |
| CDX index | 248 GB, 300 shards | about 827 MB a shard |
| WARC files | 100,000, about 92 TB | 920 MB each |
| registrable domains | about 46M | 153,744 in shard 150 (x 300); 50 to 52 a block in the samples |
| left out by the seed filter | under 1% | platforms, infra, public and adult |

## Per domain

Over 3,189 sampled domains (the 818 sample within a point):

| | share of domains |
|---|---|
| readable homepage (200, HTML) | 45% |
| no homepage capture at all (median 4 deep pages captured) | 46% |
| homepage redirects to another site | 6% |
| homepage answered 403, 404, 5xx | 3% |

Of the readable homepages:

| | share |
|---|---|
| has a title | 94% |
| has a meta description | 62% |
| contact or about page also captured | 36% |
| any email (`selectForCompany`) on the captured pages | 48% |
| an email on the domain itself | 29% |
| `isParkedPage` | 2% |
| `looksJsOnly` | 11% |
| `pageWall` | 2% |
| homepage visible text (`pageText`, capped at 6,000) | mean 2,662, median 2,268 characters |

The previous crawl (`CC-MAIN-2026-39`) has a readable homepage for 62 of
270 domains (23%) the latest one has none for. As a check, it also has one
for 153 of 240 (64%) of the domains the latest crawl does have: crawls
overlap, but each misses a lot. Two crawls together read about 57% of
domains; more crawls add less each time.

## Businesses

Claude's labels for the 375 readable homepages (sample 1):

| kind | homepages | share |
|---|---|---|
| business | 204 | 54% |
| media, blog, forum, content, spam | 50 | 13% |
| nonprofit or public body | 39 | 10% |
| unclear (too little text) | 38 | 10% |
| parked, empty, coming soon, error | 33 | 9% |
| personal | 11 | 3% |

The parked rule (`isParkedPage`) caught 6 of the 33 dead ones: most dead
homepages are empty, "coming soon" or hosting defaults, not parking pages.
A rule for those (no title and under 200 characters of text) is cheap to
add.

Of the 204 businesses:

| | share |
|---|---|
| B2C | 57% |
| B2B | 25% |
| both | 18% |
| any email on the captured pages | 67% (136; about 6 are junk such as theme demo addresses, so 64%) |
| email on the business's own domain | 43% |
| email with homepage only captured (112) | 58% |
| email with homepage and one more page (66) | 70% |
| email with all three pages (26) | 96% |
| `looksJsOnly` | 3% |
| languages | English 52%, German 8%, Spanish 6%, Russian 5%, then French, Japanese, Italian, Chinese |

The off-domain emails are mostly real: a small business on gmail.com,
hotmail.com or aon.at, or a sister domain (`muehlhans-hls.de` for
`mühlhans-hls.de`). The email rate rises steeply with the pages captured,
so a follow-up fetch of `/contact` for the businesses Common Crawl only has
the homepage of would close most of the gap; the live crawl
(`crawl-benchmark.md`) finds an email on about 60% of company sites.

## Fit scoring from the head

How well the homepage alone lets the fit gate (`fit.ts`, mode `gate`)
judge a business against a description like "B2B SaaS selling to HR teams"
or "dental clinics in Germany":

| | title and description | with the start of the text |
|---|---|---|
| strong: says what it sells and to whom, or the trade | 75% | 89% |
| partial: the industry, not the offering | 16% | 10% |
| none: empty, a brand name or "Home" | 10% | 0.5% |

The seed keeps the same title, description and text, so a Common Crawl row
is as good for the gate as a seeded one. Keeping the first 600 characters
of text next to the head lifts the strong share by 14 points, which is
worth its storage.

## Extrapolated to the whole crawl

| | one crawl | two crawls |
|---|---|---|
| domains with a readable homepage | 20.5M | about 26M |
| businesses (54%) | about 11M (10 to 12M) | about 14M |
| of those B2B or both (43%) | about 4.8M | about 6M |
| businesses with an email on Common Crawl's pages (64%) | about 7M | about 9M |
| businesses the gate can judge from the head (75% strong) | about 8M | about 10.5M |

The 95% interval on the business share from 375 labels is plus or minus 5
points. The unclear 10% holds some more businesses with thin homepages.

## Cost, time and storage on the VPS

`vps-eu-1`: 4 vCPU (EPYC 9354P), 16 GB RAM, 175 GB disk free. It downloads
from `data.commoncrawl.org` at about 107 MB/s (one 200 MB range in 2 s).

| step | volume | time | cost |
|---|---|---|---|
| read the 300 CDX shards | 248 GB download | 1 to 3 hours of transfer; 82 s CPU a shard on one core, about 2 hours on 3 cores | 0 |
| homepage records by range | about 20.5M requests, about 50 KB each, about 1 TB | 7 to 22 days at the measured 11 to 32 requests a second | 0 |
| contact and about pages for businesses without an email | about 2 to 3M requests | 1 to 3 days | 0 |
| parse (cheerio, extraction) | 23M pages | runs inside the fetch, not the bottleneck | 0 |
| LLM business classification of 20.5M homepages | about 5B input tokens | | thousands of dollars: skipped |

Rate limit, measured: 12 requests at once ran at 86 a second, and a second
run started beside it got **403 on every request** for several minutes.
At 4 at once the same host gave 11 and 32 requests a second with up to 2%
retries (503). Plan on 20 a second and back off on 403 and 503. Monthly
transfer for the whole load is about 1.4 TB, well inside a VPS plan.

Storage for 20.5M rows (homepage title, description and 600 characters of
text, both full text vectors and the GIN index): about 3 to 4 KB a row, so
60 to 80 GB. Keeping 3 full pages a row as `domain_pages` does
for crawled domains (up to 6,000 characters each) would be about 10 KB a
row, over 200 GB: too much for this disk. The production database is
Supabase, where 80 GB is about $10 a month of disk; a separate Postgres on
the VPS (as `icp-rethink.md` suggests) fits the free disk but leaves little
headroom.

Faster, if a budget is approved: the same data sits in S3 `us-east-1`. A
spot instance there reads the columnar index with Athena (well under a
dollar for the few columns needed) and fetches the records from S3 in a
day, for tens of dollars. Not used here: it needs an AWS account and spend.

## Caveats

- One crawl's sample, 375 labels for the business share. The rule based
  figures come from 4,552 domains.
- Common Crawl is biased to linked, English sites, and 46% of domains have
  no homepage captured at all. Small local businesses with no inbound links
  are the ones it misses most, so OpenStreetMap stays the source for local
  searches.
- Common Crawl obeys robots.txt, and so do we by reading only what it
  fetched. Its terms of use allow commercial use; the index keeps the same
  company text our own crawl keeps, and no email addresses
  (`1720_company_index` cuts them out).
- Pages are up to a few weeks old at load time and age from there; the
  `domains` row's 12 month retention applies, and a search that picks a row
  still crawls the site live.
