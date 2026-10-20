# Should nvoke send? (2026-10-20)

The question: make nvoke a full lead finder and sender, end to end, like
getle.ad, using Day3 for delivery. This file is what that would take.

## Short answer

- **Day3 cannot be the sender.** Its terms ban cold outreach and scraped
  lists. Its content review flags cold wording. All tenants share one SES
  account, so a cold sending tenant would hurt every paying Day3 customer.
  SES's own AUP bans unsolicited mass email too, as do Resend, SendGrid,
  Mailgun and Postmark.
- **Cold email runs on Google Workspace and Microsoft 365 mailboxes** on
  lookalike domains, 25 to 50 sends per mailbox a day, warmed for 4 to 6
  weeks. That is what Getlead does. It is a different stack from Day3.
- **Getlead is smaller than it looks.** TrustMRR on 2026-10-20: $1,249 MRR
  (down from $2.1k on 10-17), $11.6k in the last 30 days, mostly prepaid
  credits, 48 active subscriptions. Trustpilot complaints: hard to cancel,
  lead quality, support silent for a week, an unverified Google app.
- Three ways to go end to end, from cheapest to most expensive: push to the
  user's sending tool, send from the user's own mailbox, or run mailboxes
  like Getlead. Details and cost below.

## What Getlead does

Sources: getle.ad, /pricing, /pre-warmed-mailboxes, /terms, TrustMRR.

1. Paste your site, get a plan in 60 seconds (free to view).
2. It reads your offer and proof, ranks segments by match score, skips weak ones.
3. Leads from a database ("900M" on the home page, "177M+" on pricing,
   source not named). MX and SMTP check, again right before each send.
4. AI writes one email per person, opener from the prospect's own site,
   subject lines A/B tested.
5. A new campaign sits one hour in review, then starts by itself.
6. Follow-ups, AI replies, books meetings into your calendar.
7. Daily budget cap; it shifts spend toward the cheapest replies.

Mailboxes: the first deposit assigns 3 pre-warmed Google or Microsoft
mailboxes on lookalike domains registered to you. 3 mailboxes per domain,
25 cold emails each a day. Extra packs $39, $119, $269 a month for 3, 12, 30.
Price: $0.03 per sent email, $30 for 1,000, credit never expires.
"Unlimited" is $697 a month for 36 mailboxes (1,080 a day).

Legal: Adgrow sp. z o.o., Warsaw. The terms never say who the sender is,
push all compliance onto the user, take an indemnity and cap liability at
$100. The privacy page names no controller and no lawful basis. That moves
risk on paper only.

## What nvoke already has

Most of the front half of Getlead's journey exists:

- Start from your website: `apps/server/src/profile/`, `site_profiles`.
- ICP searches: `apps/server/src/leads/planner.ts`, `sources/icp.ts`.
- People per company with names and titles: `worker/people-job.ts`.
- Verified addresses: `apps/server/src/leads/verify/`.
- Openers grounded in a quote from the page: `apps/server/src/openers/`.
- Suppression, kept forever as hashes: `apps/server/src/leads/suppression.ts`.
- Signed webhooks, a job queue (`worker/queue.ts`), an LLM client with a
  budget (`apps/server/src/ai/`).

Missing for sending: the whole back half. Sequences, a sender, mailboxes,
warmup, reply detection, unsubscribe handling, bounce feedback into
suppression, a send meter in `plans.ts`.

Also note: verification is weak right now because Hostinger throttles IPv4
port 25. Sending to poorly verified lists burns mailboxes fast, so that has
to be fixed first in every option.

## Hard constraints whatever we pick

- **Mailbox providers:** spam complaints under 0.1%, never 0.3% (Gmail,
  Yahoo). SPF, DKIM, DMARC aligned. One-click unsubscribe (RFC 8058).
  Exchange Online caps a mailbox at 2,000 external recipients a day
  (from 2026-10-01 for existing tenants).
- **Google's Workspace AUP bans unsolicited mass email.** Every Workspace
  cold setup, Getlead's included, is technically in breach. Accounts get
  suspended; that is the operating risk sellers price in.
- **Law:**
  - Denmark (Markedsføringsloven §10) and Germany (UWG §7) need prior
    consent, B2B included. Fines in Denmark start at 20,000 kr for one email.
  - UK PECR allows email to corporate subscribers with an opt-out.
  - US CAN-SPAM is opt-out, up to $53,088 per email. The FTC says both
    advertiser and sender can be liable, and liability cannot be
    contracted away.
  - If nvoke picks the recipients, writes the copy and sends, it is a
    sender (likely a joint controller under GDPR), not a research tool.
- **Our own paper:** "nvoke never sends" is the base of `docs/legal/lia.md`,
  `dpia.md` (risk R1), `lawyer-brief.md`, `ropa.md`, the terms
  (`apps/site/app/terms/page.tsx:37`), the FAQ, `/tools`, the catalog's agent
  instructions and the launch video ("We find. You send."). Options B and C
  below need that rewritten and the lawyer brief re-asked.

## Option A: push to the user's sending tool

One button: "Send with Instantly / Smartlead". nvoke creates or fills a
campaign with leads, names and openers. The user's tool sends.

- Instantly API v2: `POST /api/v2/leads/add`, 1,000 leads a call, any paid
  plan. Smartlead: 350 leads an upload, 60 requests a minute.
- Needs: an encrypted per-user key store, a push job on the queue, a
  status per push, UI on web and desktop. This was the quest parked on
  2026-10-17 as "too big for a quick adapter".
- Legal position unchanged: the user is the sender.
- **Effort: 1 to 2 weeks.** No new ops.
- Weakness: not truly end to end. The user still needs a second tool and
  mailboxes.

## Option B: send from the user's own mailbox

The user connects Gmail or Outlook by OAuth. nvoke writes a short sequence,
sends from that mailbox at a safe pace, watches for replies and stops on
reply. Like Instantly, but built around nvoke's leads and openers.

- Needs:
  - Gmail API and Microsoft Graph OAuth. Sending is a sensitive Google
    scope. Reading replies is a restricted scope, which needs Google app
    verification plus a yearly third-party security assessment (CASA).
    Plan for weeks of lead time. Getlead's own reviews show what an
    unverified app looks like to users.
  - Sequence engine: steps, waits, randomized send times, per-mailbox daily
    cap (default 30), stop on reply, bounce or unsubscribe.
  - Reply and bounce detection by polling the mailbox (or Gmail push and
    Graph subscriptions), threading by Message-ID.
  - Unsubscribe link and header, feeding `suppression.ts`.
  - A simple inbox view of replies.
  - Encrypted token store, a send meter in `plans.ts` and in Clerk.
  - A country gate: no sends to Danish or German recipients by default.
  - Rewritten legal docs and terms; the user is still the sender, nvoke is
    the tool, the same line Instantly holds.
- **Effort: 6 to 10 weeks** plus Google verification time.
- Ops: moderate. No mailboxes of ours to burn, but support load for
  deliverability rises.
- Weakness: a user with one real mailbox gets about 30 sends a day, and
  burning their main domain is a real risk. Serious users will want
  secondary domains, which leads to option C.

## Option C: run mailboxes like Getlead

nvoke buys domains and Google or Microsoft mailboxes through a reseller API
(InboxKit, Zapmail, Infraforge; about $2.50 to $4 a mailbox a month plus
domains), warms them, sends, reads replies, books meetings.

- Needs everything in B, plus: domain purchase and DNS, mailbox
  provisioning and rotation, a warmup network (or a paid one at $15 to $49
  a mailbox a month), health monitoring per mailbox, replacing burned
  mailboxes, prepaid credit billing, AI reply handling.
- **Effort: 3 months or more**, then ongoing ops every week: suspensions,
  blacklists, refunds.
- Legal: nvoke is the sender in practice. Highest exposure, and directly
  against the 2026-10-17 decision and the risk appetite in our legal notes
  (grey is fine, clearly illegal is not). Sending to Denmark or Germany
  without consent is clearly illegal.
- Margin: Getlead's $0.03 a send on 25 sends per $3 mailbox a day is good
  margin, but the market sets that price and Getlead is already cutting it.

## Recommendation

1. **Ship A now.** It closes most of the "end to end" gap for a week or two
   of work and keeps the legal position. Most buyers who want to send
   already pay for Instantly or Smartlead.
2. **Fix verification (port 25) before any sending work.** Every option
   depends on clean lists.
3. **Decide on B after A has real users.** If many users ask for "send
   without another tool", B is the honest version of end to end: their
   mailbox, their name, nvoke's leads and openers. Start Google
   verification early, it is the long pole.
4. **Don't build C, and don't use Day3 for cold email.** C turns nvoke into
   a mailbox operator with the most legal exposure, and Day3 would put its
   own customers at risk.

## Sources

- https://getle.ad/, /pricing, /pre-warmed-mailboxes, /terms, /privacy
- https://trustmrr.com/startup/getlead
- https://www.trustpilot.com/review/getle.ad
- https://support.google.com/a/answer/81126 (Gmail sender rules)
- https://senders.yahooinc.com/best-practices
- https://mc.merill.net/message/MC787382 (Exchange 2,000 a day cap)
- https://workspace.google.com/terms/use_policy/
- https://aws.amazon.com/aup/, https://resend.com/legal/acceptable-use,
  https://www.mailgun.com/legal/aup/
- https://developer.instantly.ai/, https://api.smartlead.ai/reference/rate-limits
- https://www.danskindustri.dk/brancher/di-handel/radgivning/viden-om/spamforbuddet/
- https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/business-to-business-marketing/
- https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Day3: `day3.app.website/app/legal/acceptable-use/page.tsx`,
  `day3.app/src/services/risk.ts`, `day3.app/src/email/ses.ts`
