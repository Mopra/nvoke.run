# SMTP throughput: how to verify more than the VPS allows

Written 2026-10-19. A plan, nothing here is built yet.

## Short answer

The ceiling is not "7,200 checks a day". It is about **5,760 IPv4 sessions a
day for the worker**, and a session checks a whole domain (up to 6 or 8
addresses). IPv6 already ships and is not under that cap. The real squeeze is
domains whose mail servers have no IPv6 address, mostly Microsoft 365 and
ordinary hosting MX. Those all queue behind 4 IPv4 sessions a minute.

At a planning figure of 2 sessions per verified email, the IPv4 lane carries
about 86,000 verified emails a month for all users together. Two customers on
the 100,000 plan fill it. Fix it in this order: measure, reclaim the cheap
slots, stop wasting sessions, then route IPv4 port 25 through one small relay
node at a host that allows it. Paid verification APIs lose money at the top of
the ladder and are a last resort.

## What the code does today

Read from `apps/server/src/leads/verify` (`index.ts`, `pacing.ts`, `smtp.ts`,
`db-cache.ts`), `apps/server/src/worker/people-job.ts`,
`apps/server/src/worker/pipeline.ts` and `apps/server/src/tools/deps.ts`.

**The budget counts sessions, not RCPTs.** `SessionPacer.take` is called once
per SMTP connection. Every RCPT inside the session is free against the budget.
So decoys and extra candidates cost nothing we are short of. Only fewer
connections help.

**Three limits, sliding one minute windows** (`pacing.ts`):

| Limit | Key | Default | Worker gets |
| --- | --- | --- | --- |
| IPv4 sessions, all hosts | `ipv4` | `SMTP_PROBES_PER_MINUTE=5` | 4 (tools keep 1) |
| All sessions, IPv4 and IPv6 | `all` | `SMTP_SESSIONS_PER_MINUTE=60` | 59 |
| Per mail provider | `provider:google`, `provider:outlook`, else MX registrable domain | `SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE=20` | 20 |

The code assumes the Hostinger throttle is **global for IPv4 port 25**, one
key for every destination. Per provider limits exist too, but they are
politeness toward the receiver, not the Hostinger cap. A 421 from a provider
cools that provider for 5 minutes. Over budget, a check goes back in the
queue for when a slot frees (`smtp_paced`, not a retry).

**IPv6 is already built** (commit `1d23e4f`, 2026-10-17). `smtp()` resolves
AAAA for the MX host and connects over IPv6 when it has one, falling back to
IPv4 on a connect failure, a 5xx before RCPT, or a policy block (5.7.x,
Spamhaus, PTR). IPv6 sessions skip the `ipv4` key. 5 IPv6 connect failures in
a row turn IPv6 off for 30 minutes. Each fallback costs an IPv4 slot.

**Session reuse per domain:**

- The people job (`probeDomain`) asks about up to 5 people in one session:
  one decoy, then candidates, at most 6 RCPT with a known pattern and 8
  without. Accepted addresses go into the cache, so their verify job costs no
  session.
- `verify()` batches only checks of one domain that are in flight at the
  same moment (`batched`, up to 5 per session, plus 2 decoys). The check
  policy (`checkPolicy`) deliberately staggers a company's checks: named
  people with a title first, the rest wait for them. So a company's later
  checks usually open their own session. In practice a company takes 1 to 3
  sessions.
- One connection per MX host at a time (`KeyedMutex`), at most 2 MX hosts
  tried per check.

**Caching:**

- Per address in `email_checks`, shared by every user: `valid` 30 days (7 before 2026-10-20),
  `unknown` 1 day, the rest 30 days. Tempfails, `smtp_paced`, MX only and DNS
  errors are never cached.
- Per domain, in memory only: catch-all and not catch-all verdicts for 1
  hour, MX lookups for 1 hour. A worker restart forgets all of it, and so
  does the API's verifier, which is a separate instance.
- A not catch-all verdict within the hour skips the decoys. A catch-all
  verdict within the hour skips the session entirely.

**Retries:** a tempfail (4xx, dropped or stalled session, unreachable) is
queued again 10 minutes later, twice (`GREYLIST_RETRIES = 2`). A greylisted
address can cost 3 sessions. The people job retries once.

**Other IPv4 spend:** the port 25 canaries (Gmail, iCloud, Yahoo over IPv4)
take up to 3 IPv4 slots when 5 providers fail in a row. The free tool
reserves 1 IPv4 slot a minute (1,440 a day) but has a daily cap of 300
probes, so at least 1,140 IPv4 slots a day sit idle by design.

**Probes per verified email.** Nothing logs this yet, so this is an estimate
from the code paths. Per 100 companies with people: about 100 people
sessions, 30 to 60 verify sessions for printed addresses and later waves,
10 to 20 greylist retries. Catch-all domains (often a quarter of B2B domains)
take sessions and yield nothing billable. With 1 to 2 verified emails per
company that reaches a valid one, that is **1.5 to 3 sessions per verified
email; 2 for planning**.

## Capacity today

| Lane | Per minute | Per day | Per month | Verified emails a month at 2 sessions each |
| --- | --- | --- | --- | --- |
| Worker IPv4 (all IPv4 only MX) | 4 | 5,760 | 172,800 | about 86,000 |
| Worker IPv6, one provider (Google) | 20 | 28,800 | 864,000 | about 430,000 |
| Worker IPv6, all providers | 59 | 84,960 | 2.5 million | about 1.3 million |

Who needs what: one customer on `emails_100000` needs about 3,300 verified
emails a day, about 6,700 sessions. If 40% of their domains are IPv4 only
(a guess, measure it), that is 2,700 IPv4 sessions a day, **47% of the IPv4
lane**. Two such customers, or about ten on `emails_20000`, fill it. After
that, searches still finish, just slowly: a check waits for a slot instead of
ending `unknown`.

Two caveats make the IPv4 number softer than it looks:

1. 5 a minute is not proven safe. The 2026-10-15 retest (12 of 12 IPv4
   timeouts) ran after a burst, minutes after pacing shipped. If Hostinger
   reacts to bursts rather than a rate, a sliding window that lets 5 go in
   the same second may still trip it.
2. Whether the cut is global or per destination is unknown. The memory notes
   only that IPv4 port 25 to Gmail died while other ports worked. The code
   treats it as global, which is the safe guess.

## Options, ranked by impact against effort

| # | Step | Effort | Gain | Cost |
| --- | --- | --- | --- | --- |
| 1 | Measure: MX census and session counters | S | Turns every number above into a fact | 0 |
| 2 | File the Hostinger ticket | XS | Unknown, possibly the whole problem | 0 |
| 3 | Even spacing for IPv4 sessions | XS | Fewer lockouts, maybe a higher safe rate | 0 |
| 4 | Give the tools' IPv4 slot back | S | +25% IPv4 lane (4 to 5 a minute) | 0 |
| 5 | Persist domain verdicts in Postgres | S to M | Catch-all domains cost 0 sessions after the first; decoys skipped across restarts | 0 |
| 6 | One session per company | M | Sessions per verified email from about 2 toward 1.2 | 0 |
| 7 | Spend IPv4 slots by value | S | Paid users and primary checks first when the lane is full | 0 |
| 8 | One IPv4 relay node at a host that allows port 25 | M | Removes the Hostinger cap; lane limited by politeness, not the host | about $5 a month |
| 9 | More relay nodes with per egress limits | M to L | Linear, but only needed past roughly 1 million sessions a month | about $5 a month each |
| 10 | Paid verification API as overflow | M | Any volume | Loses money at the top plan; budget required |

Steps 3 to 7 together roughly double or triple what the current box carries.
Step 8 removes the ceiling. Do 10 only if 8 fails.

## 1. Measure first

Free, and every later step needs it.

- **MX census.** A CLI command (`cli verify census`) over `companies.domain`:
  resolve MX, AAAA for the first two MX hosts, `mailProvider()` of each. DNS
  only, no port 25, no paid API. Output: share of domains by provider and
  share with an IPv6 path. Expectation from public DNS: Google Workspace has
  AAAA on every `aspmx.l.google.com` host. Microsoft 365 on
  `*.mail.protection.outlook.com` has no AAAA unless the tenant opted in to
  IPv6; the newer `*.mx.microsoft` hosts do. Proofpoint, Mimecast, GoDaddy,
  one.com and most local hosting are mostly IPv4 only.
- **Session counters.** One row per session outcome, counted in memory and
  flushed every minute into a small table, say `smtp_sessions_daily (day,
  lane, family, provider, outcome, sessions, rcpts)`. Lane is worker or tools,
  family is 4 or 6, outcome is ok, paced, unreachable, tempfail, policy,
  ipv6_fallback. Plus `smtp_paced` deferrals per day.
- **Derived numbers** (a `cli verify capacity` command and a line on the
  operator alert): sessions per verified email (sessions over charged valid
  results that day), IPv4 utilization (IPv4 sessions over 5,760), share of
  IPv4 sessions by provider, and verify lag (p95 from `emails` insert to
  `checked_at`).

## 2. Ask Hostinger, in writing

The draft from 2026-10-16 exists; file it in hPanel. Ask four things: is
outbound port 25 rate limited on IPv4, at what rate, is the limit per
destination or global, and can it be lifted for this VPS. Say plainly what it
is: RCPT verification, no DATA, no mail sent, paced, PTR and HELO set. Also
check whether Probe, the other product on the same box, uses port 25: it
shares the throttle.

Outcomes: lifted (done, set `SMTP_PROBES_PER_MINUTE` to what they allow),
raised (good), refused or no answer in a week (go to step 8). Note that some
hosts' terms forbid list verification outright. If Hostinger's do, we stop
using its port 25 for this on IPv6 too and move to step 8 without delay.

## 3. Even spacing on IPv4

The sliding window lets 5 sessions start in the same second. If the throttle
reacts to bursts, that is exactly what trips it, and a lockout of 13 minutes
costs about 65 slots. Add a minimum gap between IPv4 session starts of
`60 / SMTP_PROBES_PER_MINUTE` seconds (12 s at 5). Small change in
`SessionPacer`. Then, with the counters from step 1, raise the rate one step
a day (5, 6, 8, 10) and stop at the first lockout. This is learning the
host's limit, not evading it.

## 4. Give the tools' IPv4 slot back

The free tool holds 1 of 5 IPv4 slots a minute and uses at most 300 a day.
Two options, the first is simpler:

- The tools verifier probes only over IPv6. For an IPv4 only MX it answers
  with `depth: domain`, as it already does past its cap.
- Or keep one budget in Postgres and let the tools borrow an IPv4 slot only
  when the worker has none queued.

Either way the worker goes from 4 to 5 IPv4 sessions a minute, +25%.

## 5. Persist domain verdicts

Today the catch-all memory is an in-memory map for one hour. Move it to a
`email_domains` table: `domain, mx_hosts, provider, has_ipv6, catch_all
(true, false, null), pattern, checked_at`. Catch-all for 30 days, not catch
all for 7 days, MX and AAAA for a day.

- A known catch-all domain costs no session at all for any user. Catch-all
  results are free to the user anyway, so those sessions earn nothing.
- A known not catch-all domain skips the decoys (fewer RCPT, which receivers
  notice even if our budget does not).
- The people job can read the pattern without a session.
- It survives restarts and is shared by the API's verifier.

Privacy: domain facts are company data, which the GDPR note
(`docs/research/gdpr-competitors.md`) already marks as fine to share across
customers.

A further step, once the table has data: a gateway provider (an MX domain
that is not Google or Microsoft) seen catch-all on at least 95% of its last
50 domains is assumed catch-all without a session. Skip this until the
census shows such providers are a real share; a wrong guess costs a user a
verified email.

Done 2026-10-20: the owner raised the `valid` TTL from 7 to 30 days, the
retention of `email_checks`, to cut repeat sessions for shared addresses
(docs/research/cost.md).

## 6. One session per company

The biggest code win. Today a company can open three sessions: the people
job, the first verify wave (titled people), the later waves (untitled,
unnamed, inboxes on request), plus retries.

- The people job's session also asks about the company's printed addresses
  that the check policy might need (named, untitled and unnamed, not role
  inboxes unless the search checks them). RCPTs are free against our budget.
  Each answer goes into `email_checks`; the verify jobs then read the cache
  and the policy still decides what is recorded and charged. Nothing extra
  is charged: only a `valid` that the policy records is.
- Cap a session at about 10 RCPT, decoy included. Past that, many servers
  answer 452 or tarpit, which costs more than a second session.
- Keep the stagger in the policy, it is about what we charge and show, not
  about what we ask.

Expected effect: sessions per verified email from about 2 toward 1.2. That
is the same as getting a 60% bigger IPv4 lane for free. Check it against the
counters.

Do not shrink the greylist retries: greylisting is the receiver asking us to
come back, and a retry is how normal mail servers behave.

## 7. Spend IPv4 slots by value

When the IPv4 lane is full, the queue decides who waits. Order the IPv4 work
by: paid plan before free, `primary` checks before the rest, interactive
searches before drops and daily rounds. The job priority column
(`1620_job_priority.sql`) already exists; the verify job can take a lower
priority when its MX is IPv4 only and the user is on the free plan. Gain is
not throughput, it is that paying users do not notice the ceiling first.

## 8. One IPv4 relay node

If Hostinger does not lift the cap, send IPv4 port 25 out through one small
VPS at a host that allows it, and keep everything else on the current box.

**Simplest form, no code change:**

1. A small VPS (1 vCPU, 1 to 2 GB, one IPv4). WireGuard between it and the
   Hostinger box.
2. On the Hostinger box, policy routing: TCP to port 25 over IPv4 goes
   through the WireGuard interface. The node masquerades it out its public
   IPv4. IPv6 stays on Hostinger, where it works.
3. Identity: `probe.nvoke.run` with an A record for the node's IPv4 and an
   AAAA for the Hostinger IPv6. PTR of both addresses set to
   `probe.nvoke.run` (the node's provider panel and hPanel). Set
   `SMTP_HELO_NAME=probe.nvoke.run`. Forward confirmed on both families.
4. `SMTP_PROBE_FROM=probe@nvoke.run` must be a mailbox that accepts mail
   (some receivers call back the sender). SPF for `nvoke.run` lists the node
   IPv4 and the Hostinger IPv6.
5. `https://probe.nvoke.run` (or a page on nvoke.run linked from the HELO
   host) says what the traffic is, that no mail is sent, and how to opt out.
   The opt out feeds the existing suppression list.
6. Raise `SMTP_PROBES_PER_MINUTE` to what the node's host allows, start at
   20 and let the per provider limit (20 a minute) do the real pacing.

At 20 IPv4 sessions a minute the lane is 28,800 a day, about 430,000
verified emails a month. That covers the whole ladder for many customers.

**Hosts.** Check each one's terms for list verification and get the port 25
answer in writing before paying. As of my knowledge: OVHcloud VPS (port 25
open by default, about $4 to 7 a month), Hetzner Cloud (port 25 blocked on
new accounts, unblock on request after the first paid invoice, about $5),
Vultr and Linode (blocked by default, unblock on request), DigitalOcean
(blocked, no unblock), AWS (blocked, removal form, poor IP reputation).
Prices and policies change; confirm.

Risks: the relay IP can get listed if traffic misbehaves (keep the per
provider limits and the 421 cooldown), the node is one more box to patch, and
WireGuard down means IPv4 checks fail. The existing port 25 canary alert
catches that last one.

## 9. More relay nodes (later)

Only needed past roughly a million sessions a month. Then routing cannot
pick an egress per session, so the verifier needs an egress pool: each
egress has its own IPv4 limit and HELO name, the node runs a SOCKS5 proxy on
its WireGuard address only, and `smtpProbe`'s `connect` learns to wait for a
proxied socket. Provider limits stay global across all nodes, kept in
Postgres. That is the line between normal and evasion: more nodes give us
port 25 capacity, never more volume to one provider than one well behaved
sender would send. About $5 a month per node.

## 10. Paid verification APIs as overflow

Revenue per verified email ranges from $5 per 1,000 (`emails_1000`) down to
$1.49 per 1,000 (`emails_100000`). An API bills per address checked, not per
valid result, and it cannot do our multi candidate session: a person with an
unknown pattern is up to 5 checks. Count 2.5 to 5 API checks per verified
email.

| Service | Rough price at volume | Cost per 1,000 verified | Top plan margin |
| --- | --- | --- | --- |
| ZeroBounce | $3 to 8 per 1,000 | $7.50 to 40 | loss, 5x to 25x |
| NeverBounce | $3 to 8 per 1,000 | $7.50 to 40 | loss |
| MillionVerifier | $0.40 to 2 per 1,000 | $1 to 10 | break even at best |
| Reacher, self-hosted | license plus our servers | same as ours | solves nothing: it needs port 25 too |

Prices are approximate, from memory; check the price pages before deciding.

Verdict: only the cheapest service, only for single printed addresses (never
pattern guessing), only on IPv4 only domains that have waited past an hour,
only for paid users, under a monthly budget like `BRAVE_MONTHLY_BUDGET_USD`
with a default of 0. Sending personal addresses to a verification vendor
makes it a subprocessor: a DPA and a line in the privacy page first. Per the
owner rule, no test calls without an approved budget, including evals.

## Monitoring: the capacity number

One number to act on: **IPv4 utilization**, IPv4 sessions used a day over
IPv4 sessions available a day (5,760 now). With it, two supporting numbers:
sessions per verified email and verify lag p95.

- Show all three in `cli verify capacity` and in the daily operator alert.
- Alert (`smtp-capacity`, at most daily) when IPv4 utilization passes 70%
  on three days in a row, or verify lag p95 passes 30 minutes.
- Forecast: (sum of paid allowances) times sessions per verified email times
  the IPv4 only share, over 30. If that passes 70% of the lane, start step 8
  before customers feel it. With one relay node that takes about a week to
  set up (provider unblock requests can take days), act at 50%.

## Legal and norms

- RCPT probing without DATA is what Hunter, ZeroBounce and every verifier
  do. No regulator guidance names it (see the GDPR note). Fine.
- Normal practice and what we keep: identified IP (PTR, matching HELO, a
  real sender that receives mail, an explanatory page), per provider pacing,
  honoring 421, 4xx and 5.7.x blocks, an opt out.
- Grey, flag before doing: several nodes probing one provider faster than a
  single sender would. Keep provider limits global to stay on the right side.
- Not doing: rotating IPv6 addresses inside our /64 to dodge a provider's
  limit (they judge per /64 anyway, and it is evasion), residential or
  rotating proxy networks, unidentified IPs, retrying through another IP
  after a provider blocked us for policy. The current fallback from IPv6 to
  IPv4 on a policy block is close to that line: it is fine while both
  addresses share the same name and identity, which step 8 keeps true.
- Using a host whose terms forbid list verification is a breach of contract,
  not a crime, but we do not do it.

## Recommended order

1. This week: file the Hostinger ticket (step 2) and ship the MX census and
   session counters (step 1).
2. Same week: even spacing on IPv4 (step 3) and give the tools' IPv4 slot to
   the worker (step 4). Lane goes from 4 to 5 a minute with fewer lockouts.
3. Next: persist domain verdicts (step 5), then one session per company
   (step 6). Together they should cut sessions per verified email from about
   2 to about 1.2, so the same lane carries about 140,000 to 170,000
   verified emails a month.
4. Add value ordering of IPv4 work (step 7) and the capacity alert.
5. If Hostinger has not lifted the cap within two weeks, or the forecast
   passes 50% of the lane, set up one IPv4 relay node (step 8). About $5 a
   month for roughly 430,000 verified emails a month on IPv4 alone.
6. Egress pool and more nodes (step 9) only when the counters say so.
7. Paid API overflow (step 10) only if no relay host works, with an approved
   budget and a DPA.
