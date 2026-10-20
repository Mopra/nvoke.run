# Rethinking Describe your customer

2026-10-20. Measured in production over 30 days: **$20.72 per 1,000 valid**
emails, against prices of $3.32 to $9 ($6.64 to $18 for ICP, whose emails
count as two since 2026-10-20). ICP searches cost $19 per 1,000 in
Brave alone. Two analyses: the funnel in production (where valid emails are
lost) and how others find companies cheaply. Scripts and raw numbers: the
cost session's scratchpad; method in `docs/research/cost.md`.

## What the funnel shows

The price per search request is not the main problem. Most of the money is
lost after the search.

1. **Port 25 throws away verified emails.** 63% of all checks (848 of
   1,342) ended `unknown`, almost all `mx_only_port25_blocked` on Google
   and Microsoft MX after the worker paused probing four times. Resolving
   them at each segment's valid rate gives about 250 more valid for no
   spend: **$20.7 falls to about $7.5 per 1,000** on its own.
2. **Escalation buys companies nobody can be charged for.** One ICP search
   (a free account, allowance 50) ran 3 escalate rounds while round 1 still
   had 268 unknowns: 202 Brave requests (54% of all ICP spend) for 10
   valid, then stopped at the allowance with 1,149 addresses never checked.
3. **Fit does not predict a valid email.** Companies scored 60 come back
   valid 4% of the time, 82 to 90 only 6.6%. Fit rejects 63 to 82% of what
   Brave returns, and Claude costs about $8.30 per 1,000 ICP valid (fit
   $0.44, people $0.26, planning $0.10 for 97 valid).
4. **Most companies print no named person.** 1,410 ICP companies, 210 with
   a named person (15%). 499 had only a role inbox, which policy never
   checks; at the 46% valid rate role inboxes showed elsewhere that is
   about 230 more valid.
5. **Search mix.** Pages 2 to 4 took 53% of one search's requests. List
   pages yielded about 2 valid per request against 0.36 for direct results;
   job post queries 1 valid for 8 requests.

Also seen: OpenRouter answered 402 (out of credits) on 2026-10-20 21:11; a
canceled web search treated directory sites as companies and queued 3,330
verify jobs; 22 verify job runs per address from deferral churn.

## Why tuning the search cannot fix it

Serper instead of Brave and the levers above bring ICP to roughly $5 to
$10 per 1,000 valid. Every search still pays to find and score companies
from scratch. Every competitor that is cheap does the opposite: build an
index once, search it for free, charge on reveal (Hunter Discover, Ocean.io,
DiscoLike, BuiltWith, Getlead's database). DiscoLike sells bare company
records at $1.50 to $3.50 per 1,000, about what our top plan charges.

## The new design: our own company index

- **Universe.** Domains from CrUX (18M live origins, free), OpenStreetMap
  (4.8M with a website), Tranco, Wikidata, the feed collectors and every
  domain we crawl. Homepage text from one Common Crawl crawl (WET files,
  free over HTTPS, or about $20 to $60 as one AWS spot job), or our own
  homepage only crawl if coverage is thin.
- **Matching.** Embed title, description and the first 300 tokens with a
  small multilingual model (multilingual-e5-small, 384 dims) on the 4070 Ti:
  20M sites in hours, about $0. Store in pgvector next to the full text
  index from 1720, on a self hosted Postgres box (about EUR 50 to 100 a
  month), not the production Supabase.
- **Search.** Haiku turns the description into 1 to 3 "how they describe
  themselves" texts plus filters (country, size, exclusions); vectors plus
  full text plus filters return candidates; a similarity cutoff and a
  local rerank replace most Haiku fit calls.
- **Front doors.** Lookalikes of these domains (or of your own site), a
  category and country browse with counts shown first, and Describe your
  customer on the same index.
- **Live web search** only as a gap filler with a hard budget (at most
  $0.25 per 1,000 valid the search has made), and whatever it finds is
  crawled into the index so the next search in that niche is free.

Estimated marginal cost: **$0.05 to $0.40 per 1,000 valid** for finding and
matching, plus the people step. Fixed cost about $100 a month.

## Plan

**Now, no decision needed (days):**

1. Port 25: probe Google and Microsoft over IPv6 or the configured relay,
   requeue `mx_only_port25_blocked` hours later instead of settling it
   `unknown`, log the search id on every unknown.
2. Escalation: cap the target at the account's remaining allowance and do
   not escalate while checks from a probe pause are open.
3. ICP mix: raise the bar for pages 2 to 4, give list and directory queries
   the budget, drop job post queries unless the customer sells to sales
   teams.
4. Fit after crawl: score only companies whose crawl found a named target,
   from the homepage text the crawl already has.

**The index (about 4 weeks):**

0. Measure coverage (2 days, free): look up every company the ICP searches
   and the crawl benchmark found in Common Crawl's index and CrUX. Over 60%
   covered: build from Common Crawl. Under 40%: our own homepage crawl
   seeded from CrUX and OSM.
1. Build the index (2 weeks).
2. Switch ICP to it, web search off by default (1 week).
3. Lookalikes and browse in the web app and desktop (1 week).

**Needs the owner's decision:**

- Check one role inbox per company that has no named person (about 230
  more valid in the sample; today's policy never checks role inboxes).
- The fixed index box (about EUR 50 to 100 a month).

## Legal flags

- OSM is ODbL: use it to find domains, take what we show from our own
  crawl, so the company list is not a derivative database. Add to the
  lawyer brief.
- Never write Brave results into the index (Brave terms 3(b)(i)).
- Common Crawl terms forbid redistributing its content; we sell only
  addresses we crawled and verified ourselves.
- Sole trader homepages are personal data and so arguably their vectors:
  keep title, description and vector, drop the page body, keep stripping
  addresses, extend the LIA.
