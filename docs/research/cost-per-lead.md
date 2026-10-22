# Cost per lead: review and plan (2026-10-22)

Cost per verified email is the number that decides margin. This review covers
everything we pay for on the way to one: paid web search, Claude in the lead
pipeline, and Claude in campaign writing. Numbers are from production
(`ai_usage`, `searches`, `companies`, `emails`, `campaign_leads`) unless
marked as an estimate.

## Where we are

Sonar (`icp`) searches, last 30 days: 3 searches, 1,864 companies, 3,889
emails found, 232 valid.

| Cost | Per 1,000 valid |
| --- | --- |
| Paid web search (Brave, 507 requests) | $10.93 |
| Claude: fit | $3.43 |
| Claude: people | $1.25 |
| Claude: plan and replan | $0.84 |
| **Total** | **about $16.40** |

An icp email counts three (`ICP_EMAIL_WEIGHT`), so 1,000 of them earn $27 on
the $9 plan and $9.95 on the $199 plan. Name lists and drops cost about $0.

The money is lost in the funnel, not in any one price:

- 1,864 companies found, 1,295 with an email, 469 with any email verified,
  149 with a valid one. **We pay search and fit for 12 companies to sell one.**
- **Search `b26e` hit the user's quota after 50 valid emails.** It had already
  paid for 301 search pages and 1,110 fit scores; 1,557 found emails were
  never verified.
- Of the emails that were verified: 232 valid, 372 catch-all, 350 unknown.
  Unknown is mostly the throttled IPv4 port 25 (see the SMTP notes). Those
  are emails we already paid to find.

## What the code does wrong

### Search

- **Escalation rounds buy a full new budget.** `ongoing.ts` aims for
  `max(100, 0.3 × limit)` verified emails and, when short, starts another
  round with another 120 pages, up to 3 a day. The floor of 100 makes it
  nearly automatic. Most of the 507 requests were escalations.
- **Spend is not bounded by what the user can buy.** Nothing compares the
  remaining quota with the search's spend before it pages, fits and crawls.
- **The budget counts pages, not credits.** A Serper page of 20 results is
  2 credits (`serper.ts` `fetchPage`), so 120 pages bill 240.
- **The company database serves little.** `fromIndex` is asked once per run,
  needs every query word to match, and only holds what we crawled.
- **Caching cannot help icp.** Claude words every query fresh; the 0% hit
  rate is expected.

### Claude in the lead pipeline

- **Fit batches are small.** `queueFit` runs 15 s after the first company
  (`FIT_WAIT_MS`), and crawls trickle in, so final fit jobs hold a few
  companies and each pays the 1,300 to 2,000 token prefix again. 564 calls
  for 3 searches against a design estimate of about 45.
- **Claude runs before anything proves an email can verify.** People runs
  inside the crawl, before final fit, so it is paid for companies fit then
  drops. No MX check runs before fit or people, though `verify/mx.ts` has one.
- **No prompt caching** (`client.ts` sends plain strings, no `cache_control`).
  Small on Haiku; the fit prefix is near the 512 token minimum.

### Claude in campaign writing

Writing is nvoke's own outreach, not a cost per sold lead, but it follows
the same rule.

- **Step 1 ran on Sonnet:** $0.044 per written lead. Now Haiku (committed,
  not yet deployed): about $0.004 to $0.005.
- **Batches are about one lead.** `enrollTick` passes every 5 minutes and
  `queueWrites` writes whatever arrived, so the head (system, sender, prices,
  brief, about 2.7k tokens) is resent for nearly every lead.
- **Paid drafts thrown away:** 17 `too_similar` and 6 `write_failed` out of 83
  leads paid for, 28% extra. The shared offer sentence likely trips the
  overlap check, and each retry resends everything.
- **Pages are sent whole:** three crawl pages of up to 3,000 chars each,
  mostly nav and footer, about 80% of the per-lead input.
- **Reasoning on low** still adds about 1k to 1.5k output tokens a call, and
  output costs 5× input.

## Plan

### Phase 1: stop paying for leads we cannot sell (small changes, days)

1. **Cap a search by the buyer's remaining quota.** Before each round and
   each paid tier, stop when found companies already cover what the quota can
   still bill (remaining ÷ weight ÷ expected valid per company).
2. **Fix escalation.** Drop the floor of 100. Start another round only when
   the last round's valid per page is above a threshold, and give it a
   smaller budget.
3. **Budget in credits, not pages** (`icp.ts` `readPage`).
4. **Fill fit batches.** Wait 60 to 90 s or for 30 companies, and flush when
   crawling ends.
5. **Free checks before Claude.** MX before people and fit; people's Claude
   step only for companies final fit keeps.
6. **Recover unknowns.** Re-check unknown results over IPv6 or on the relay
   before giving up; they are already paid for.
7. **Writing:** fill batches (10 leads or 30 minutes, the send hold hides the
   wait), trim pages to about 1,500 chars, split `write` into
   `write_first`, `write_retry` and `write_follow` in `ai_usage`.

Estimate, not measured: icp falls from about $16.40 to $4 to $6 per 1,000
valid (Serper alone takes search from $10.93 to about $4.40 at the same
yield). Recovering half the unknowns lowers it another quarter.

### Phase 2: make paid search the exception (larger, weeks)

8. **The company database as the main source.** Seed it in bulk from free
   data (Common Crawl host index, top sites), crawl in the background, match
   with OR and ranking, ask it before every paid tier. This is the only
   lever that takes search from dollars to cents per 1,000.
9. **Writing quality fixes:** rotate the offer sentence, give Claude the
   campaign's recent subjects to avoid, fold follow-ups into step 1, test
   reasoning off with an eval on the Claude subscription.
10. **Prompt caching** for fit and write once batches are full, with the
    brief moved into the cached prefix.

### Measure

`cli stats` should show, per search kind: paid credits, companies found,
companies with a valid email, valid emails, Claude per task, and the share
from the company database. Every change above is judged by one number: cost
per 1,000 valid emails.
