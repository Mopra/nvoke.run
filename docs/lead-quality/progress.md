# Lead quality: progress log

The working memory of the lead-quality mission (started 2026-10-17). Read this
first after a context reset. Newest entries at the bottom of each section.

## The bar

Would we use nvoke to find nvoke's own customers and write to them? Done
means, on a real run of the `nvoke-customers` eval search:

1. At least 300 verified emails within an hour, and it keeps filling.
2. At least 70% are named people (first name, last name, role).
3. At least half are decision makers (founder, CEO, head of sales or growth, partner).
4. A blind review of 30 random leads: at least 25 we would happily email.
5. A search that comes up short never just ends: nvoke pushes on and says what it does.
6. Cost per verified email fits `packages/shared/src/plans.ts`.

## Eval

`pnpm eval --label <name>` (server CLI `eval run`, suite in
`apps/server/src/bench/eval-suite.ts`). Fresh database per run, real
pipeline, real SMTP from this machine (port 25 is open here). Results in
`apps/server/.bench/eval/`; the markdown goes below and in `baseline.md`.

## Decision log

- 2026-10-17: The eval runs locally, not on the VPS: local port 25 is open
  and iteration is faster. The Brave and Product Hunt keys were copied from
  `/opt/nvoke/.env` into the gitignored `apps/server/.env`. Brave responses
  are cached across eval runs on disk, cost is reported as if uncached.
- 2026-10-17: Cost bar. The cheapest per email price on the ladder is the top
  plan, $149 for 100,000 ($0.0015 a verified email); the entry plan is
  $0.005. Target: at most $0.0015 per verified email in all-in API cost
  (Brave plus LLM), so every plan at least breaks even on API cost.
- 2026-10-17: LLM cost is small: Haiku 5.5 is $0.10/M input, $0.50/M
  output (`apps/server/src/ai/models.ts`), so a 3k token page read is about
  $0.0005. LLM per company is affordable; Sonnet only for planning and judging.
- 2026-10-17: VPS port 25 answered on both IPv4 and IPv6 at 17:40 UTC+2
  today. Production verification is capped at SMTP_PROBES_PER_MINUTE=5, which
  alone makes 300 verified an hour impossible. The verifier must probe a
  whole domain in one session and pace per mail provider, not globally.

- 2026-10-17: Verifier reworked (patterns.ts, verify/pacing.ts,
  worker/people-job.ts): one SMTP session per domain (decoy first, then up
  to 6 candidates), pacing per mail provider under a global ceiling,
  IPv6 first. SMTP_PROBES_PER_MINUTE now caps IPv4 sessions only (what
  Hostinger throttles); SMTP_SESSIONS_PER_MINUTE=60 and
  SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE=20 are new. This dev machine has
  no public IPv6, so IPv6 is only proven on the VPS.
- 2026-10-17: Catch-all is the main ceiling for pattern guesses: 7 of 13
  tech company domains probed accept any address. Guesses on catch-all
  domains are stored with low confidence (35, or 70 when the pattern was
  learned from a real address there) and verify as catch_all, so they are
  never counted or charged as verified.
- 2026-10-17: Email kind stays two-valued (generic, personal) in storage.
  The role versus generic distinction (sales@ versus info@) is a ranking
  concern, not a schema change that would ripple through every client.
- 2026-10-17: Registry directors (Companies House, CVR) need keys only the
  owner can register: Horadric quest filed. Until then people come from the
  company's own pages.

## Findings (baseline)

Pipeline today (mapped 2026-10-17):
- No person names or titles are extracted anywhere. Team pages are crawled
  for addresses only.
- No address pattern guessing.
- No query expansion: one query, one country, up to 10 Brave pages.
- SMTP: global 5 probes a minute on the VPS, no IPv6 preference, catch-all
  detected with 2 decoys per address.
- Emails table has kind (generic or personal) and source_url only, no name,
  title, confidence or found-via.

## Plan

1. Eval harness and baseline (in progress).
2. Schema: people, emails with name, title, seniority, found via, confidence.
3. Parallel workstreams: people extraction and pattern guessing (B), verifier
   throughput and IPv6 (B), plain-words search with planner, listicle and
   directory mining and fit scoring (A, D), ranking and CRM export (C),
   web app and desktop experience (E), cost tracking (F).

## Runs

### 2026-10-17 baseline (old pipeline, 60 min, SMTP 5/min)

Full tables in `baseline.md`. nvoke-customers: 330 companies, 675 emails,
47 verified in an hour, 0 named, would email 5 of 30, clear fit 40%.
Whole suite: 3,176 emails found, 237 verified, 2,774 never checked.

### 2026-10-17 icp1 (new pipeline, nvoke-customers as one plain words search, 20 min, SMTP 5/min, local IPv4)

470 companies, 933 emails, 167 named, 155 titled, 115 decision makers,
67 verified (41 personal, 21 named, 11 built from the pattern). Would email
18 of 30 (baseline 5), clear fit 52% (baseline 40%). Brave 120 requests
($0.60, the per search cap), AI $0.10, $0.010 per verified email.
795 addresses still unchecked at the end: SMTP throughput is still the wall
in this setup, and role inboxes ate sessions that named people needed.

Changes since: verify jobs carry a priority (decision makers 30, named 20,
personal 10, role inboxes 0, pattern hits 40; migration 1620), short
searches are held and re-planned (ongoing.ts), ongoing searches get a daily
round, the eval runs the ongoing tick.

Next: fit precision (agent running), desktop UI (agent running), then a
60 minute run of the full suite in icp mode, then deploy and dogfood on the
VPS where Google and Microsoft mail go over IPv6 at 20 sessions a minute.

### 2026-10-17 vps-icp1 (deployed pipeline on the VPS, nvoke-customers, 60 min, IPv4 2/min plus IPv6)

236 companies, 498 emails, **274 verified** (baseline 47), 146 personal,
88 named, 135 decision makers found, 61 verified from the pattern.
Clear fit 84% (baseline 40%). Would email 8 of 30: the sample took every
verified address, so info@, hr@ and dpo@ inboxes and HR or customer
success staff filled it. Brave 95 requests ($0.475), AI $0.125, $0.0022
per verified email. Verification is no longer the wall on the VPS: IPv6
carried it (4 pending at the end). Discovery is: companies stalled at 236
from minute 25 and the never-short round did not add any.

Decisions:
- The would-email judge now samples what the results show by default
  (personal addresses, a role inbox only for a company with no valid
  personal one). That is the list a user reviews. Earlier would-email
  numbers sampled every address and are not directly comparable.
- The eval records each search's stage, stage note and number of runs.

Running now: verification policy (do not check or charge role inboxes and
irrelevant staff when the company has a decision maker), up to 5 people
per company, names from first.last addresses, the escalation that did not
fire; and discovery yield (hiring signals from public ATS boards, fuller
list page mining, fit for small B2B companies that show outbound).

### 2026-10-17 policy1 (local, nvoke-customers, 25 min, SMTP 30/min)

347 companies, 785 emails, **326 verified in 25 minutes** (target 300 in
60). 247 personal, 79 role inboxes (fallbacks for companies with no
personal address), 142 named with a title (44%), 115 decision makers
(35%). Clear fit 68% of 25, would email 11 of 30. $0.003 per verified
(Brave $0.58, AI $0.23). The plan ran out at 347 candidates; the
escalation correctly did not fire because the target was met.

Changes in this round:
- Role inboxes and off-target staff (HR, privacy, support, finance,
  assistants) are skipped, hidden and never charged when the company has a
  valid personal address or decision maker (`emails.skipped`, 1640).
- People job: up to 5 people per company, still one SMTP session.
- first.last@ addresses fill first and last name (confidence 80).
- Escalation fixed: the hold now estimates the final count from the valid
  rate so far, not from every unchecked address; paced people jobs no
  longer block it.
- Discovery: public job posts on ATS boards (hiring = outbound now), up to
  400 list pages a run with next pages: 404 kept companies per 120 Brave
  requests (was 244) at 84% clear fit.
- The ICP judge now sees when a company was found through its own job
  post. Without it the judge graded every small startup hiring SDRs as the
  wrong buyer, which a human reviewer would not.
- The eval reports the bar ratios: valid named+titled and valid decision
  makers as shares of verified, and skipped addresses apart from pending.

Gaps against the bar: named share (44% vs 70%), decision makers (35% vs
50%), would email (11 vs 25), cost ($0.003 vs $0.0015). The named share
is dragged down by role inbox fallbacks and unnamed personal addresses.

### 2026-10-18 policy2 (local, nvoke-customers, 25 min, SMTP 30/min)

471 companies, 854 emails, **162 verified**, **72% named with a title,
64% decision makers** (both past the bar), would email **21 of 30**
(was 11), clear fit 80%. $0.007 per verified (Brave $0.49, AI $0.43).
Escalation now works: 4 rounds in 25 minutes, companies 411 to 471.

Decision: role inboxes are no longer checked by default
(`searches.check_inboxes`, 1650, default false) and unnamed personal
addresses are checked only when a company has no valid named person. That
traded half the verified count for the quality bar. The volume and the
cost now have to come back through more companies and more named people
per company, not through inboxes.

Next: cost per verified ($0.007 vs $0.0015) and volume (162 in 25
minutes). Then a full 60 minute run of every entry on the VPS.
