# Sending: development plan

nvoke goes end to end: find the leads, write the emails, send them from
real mailboxes, catch the replies. Background and the market are in
`docs/research/sending.md`. This file is the plan to build it.

Four steps, each shippable on its own:

1. The engine, with mailboxes the user connects (SMTP and IMAP).
2. Sign in with Microsoft and Google instead of passwords.
3. Mailboxes nvoke provides, Getlead style.
4. AI on replies and meeting booking.

Every step lists what it builds, where the code goes and when it is done.

## Internal only (owner, 2026-10-20, final)

Sending is not a customer feature. nvoke is a scraper and verifier for
customers; the code below runs only for nvoke's own account, so nvoke can
market itself on autopilot. `SENDING_USERS` (Clerk user ids) is the
allowlist: every other account gets 404 on the sending routes and the
worker never enrolls, sends or polls for them. Sending is left out of the
catalog, OpenAPI, MCP, `/docs`, `llms.txt`, `agents.md`, marketing and the
desktop; the web app shows its screens only to allowlisted accounts. The
legal docs keep "nvoke never sends email for customers"; nvoke's own
outreach is recorded as its own processing (`docs/legal/ropa.md`,
Activity 3). Customers send through their own tool (CSV, webhooks, a later
push to Instantly or Smartlead). Steps 2 to 4 below are shelved, except
Step 2's Microsoft sign-in, built 2026-10-27 for nvoke's own Microsoft 365
and Outlook mailboxes.

## Own products: Day3 and exit1 (owner, 2026-10-22)

The owner's personal cold email for Day3 and exit1 (run by hand from Zoho
in the mrr project) moves onto this engine. Still internal: the same
`SENDING_USERS`, the owner's own products, no customer feature.

- **Product profile.** `campaigns.product` (`CampaignProduct` in
  `packages/shared/src/sending.ts`): name, domain, what it is, the offer,
  who it is for, the real prices in plain words, the pitch (why these
  recipients, why now) and an optional `recheck`. Set, `write.ts` writes
  from it instead of the site profile and nvoke's `plans.ts` prices, may
  name the company's own bare domain (an exit1 email is about their site),
  and the signature falls back to the product's domain. The two campaigns
  are `docs/sending/campaigns/day3.json` and `exit1.json`.
- **Opt-outs per sender.** `send_suppressions.sender` is the product domain
  an opt-out holds for, or '' for every campaign of the account. An opt-out
  reply or unsubscribe from a product campaign holds for that product; a
  bounce, and an opt-out from a campaign without a product, hold for all.
  The mrr history (`outreach/sent.csv`, `do-not-contact.txt` and every
  address in `leads/drafts-*.json`) is in for day3.app and exit1.dev
  (`cli sending opt-outs`); Endress+Hauser (an exit1 customer) is blocked
  for every sender.
- **Pools.** Mailboxes in one provider organization share its limit:
  `send_pools (name, daily_cap)` and `mailboxes.pool`. A send needs room
  under the mailbox's own cap and under the pool's, counted over the last
  24 hours across the pool (`cli sending pool`). All Zoho mailboxes of the
  pradsgaardlabs org are one pool.
- **List import.** `cli sending import` takes JSON or CSV leads (domain,
  the published address, name, location, and a checked `fit_reason`) into
  a `domains` search marked `import`: the crawl reads the pages for the
  write job but stores no addresses of its own, and only the imported
  address is verified and enrolled. An autopilot campaign on that search
  picks up every later import into it.
- **Recheck.** `recheck: 'ssl'` (exit1): just before each step the sender
  shakes hands with the lead's apex and www host (`sending/recheck.ts`).
  Still expired, running out within 30 days, self-signed or for another
  host: it sends. Fixed: the lead stops with skip_reason `resolved`.
  Neither host answers: `unreachable`.

## Owner decisions, 2026-10-20 (earlier the same day)

- **First goal: nvoke sells nvoke.** Ongoing searches and drops find
  nvoke's customers, an autopilot campaign writes and sends to them.
  Steps 0 and 1 plus "Autopilot" below come first; steps 2 to 4 later.
- **Approve once, then automatic.** A campaign is started once by a person
  in the web app. After that every new valid lead from its source is
  enrolled, written and scheduled with nobody clicking (see "Autopilot").
  This replaces "a person reviews every campaign" for autopilot campaigns.
- **nvoke's own sends go from a mailbox the owner already has**, connected
  over SMTP and IMAP. No provided mailboxes for now.
- **Legal:** the owner accepts the open question whether Markedsføringsloven
  §10 covers a Danish company's cold email to recipients abroad. Sends go
  out once the engine works; Denmark and Germany stay blocked.

## Autopilot

A campaign can follow a source instead of a fixed list:

- `source`: `list` (fixed leads at create, as in step 1), `search` (an
  ongoing search: every new valid address it adds) or `drop` (every search
  the drop makes from now on).
- `autopilot` true for `search` and `drop`. Every 5 minutes the worker's
  enroll tick (`sending/enroll.ts`) takes the source's valid addresses not
  yet in the campaign, applies the rules below, enrolls them and queues
  `write` jobs. A paused, canceled or done campaign enrolls nothing.
- **Full write batches:** an enrolled lead waits in `writing` until its
  campaign has 10 waiting (`WRITE_BATCH`) or the oldest has waited 30
  minutes (`WRITE_WAIT_MS`), then goes into one job
  (`campaign_leads.write_queued_at`). The enroll tick sweeps every campaign
  with a lead past the wait, paused ones too, so none is left unwritten.
  The first enroll at create writes at once: the owner is waiting.
- **Who gets enrolled:** `valid` only (`catch_all` when the campaign says
  so), named people first (`people_only`, default true: `first_name` set),
  at most `per_company` per company (default 1: the highest seniority,
  then confidence), never an address already in another of the user's
  campaigns in the last 90 days, never suppressed, never a blocked country.
- **Hold:** a written lead's first send is no earlier than `hold_hours`
  (default 2) after it was written, so the owner can read the day's emails
  in the campaign screen and stop any of them. The hold counts from the
  write, so the batch wait comes on top of it: at most 30 minutes, inside
  a send schedule that spreads a day's sends over working hours anyway.
- **Daily ceiling:** `daily_new` (default 30) caps how many new leads a
  campaign enrolls a day, so a big drop does not queue weeks of sends.
- The first start of an autopilot campaign needs a Clerk session, like
  `start` in step 1. Pausing stops enrolling and sending; resuming picks up.

## Writing

The benchmark is the hand-written Day3 and nvoke batches of October 2026
(one reply: "Outstanding cold outreach!"). `write.ts` holds Claude to what
made them work:

- **Why now.** Each lead carries its fit signal: `companies.fit_reason`, the
  source (a job post for a sales role, a launch) and the campaign's search
  words and plan (`<campaign>`). Claude builds the reason to write from the
  signal when it is concrete and never invents one.
- **One fresh detail.** Besides the kept crawl pages, the write job reads
  each company's newest post (`fresh.ts`): one blog, news, changelog or case
  study page picked from the homepage links, fetched with the list page
  rules (guarded fetch, robots.txt, the shared per host rate, 2 MB, 12
  seconds) and passed as `<page kind="latest">`. A failure only means no
  post. Per lead the prompt has that post, the homepage and the opener's
  quote, each cut to about 1,500 characters with menu lines and cookie and
  copyright lines dropped (`trimPage`). Claude quotes the words its detail
  rests on; an email whose quote is not in that same trimmed text is not
  kept.
- **Numbers for them.** When the sender is nvoke, the prompt has the real
  prices from `plans.ts`, and Claude may work out one number, from a fact on
  their pages or framed as an example.
- **Shape.** Step 1 is 60 to 110 words (kept from 45 to 125), a closing
  question only they can answer and a subject about them; follow ups are 25
  to 60 words (kept from 12 to 75), each from a new angle and never a
  rephrase of step 1.
- **No template feel.** `overlap.ts` compares each new step 1 with the
  campaign's other step 1 emails of the last 7 days and the batch so far
  (word trigram containment above 0.2, a shared sentence of 7 words or more,
  or a near duplicate subject). A sentence with three quarters of its words
  from the offer (sender, prices, pitch, campaign, briefs) is left out of
  the comparison: every email states the same offer. The prompt lists the
  subjects and closing questions the campaign already used (`<recent>`) for
  Claude to avoid. A lead that clashes, broke a rule or quoted wrongly is
  asked for once more with what to avoid named; still too similar, it fails
  with skip_reason `too_similar`.
- **One ask for every step.** Step 1 and its follow ups come in one answer
  (`write_all` in `ai_usage`). The second try for a step 1 asks again for
  every step (`write_retry`); a lead whose step 1 passed but whose follow
  ups did not gets one ask for the follow ups alone (`write_follow`). The
  head (sender, prices, pitch, campaign, briefs, `<recent>`) goes as the
  cached prefix, so the second try reads it from the cache.
- **Footer** (`footer.ts`). The signature is the mailbox's, else the
  display name's first name and the sender's site domain. The "why you" line
  and the opt-out line are each one of 10 hand-written variants, picked by
  the lead so a thread stays the same. Every opt-out variant asks for a
  reply `classify.ts` reads as an opt-out ("no", "stop", "not interested",
  "remove me").

## Principles

- **Real mailboxes only.** Mail leaves through the mailbox provider's own
  submission server (`smtp.gmail.com:587`, `smtp.office365.com:587` and so
  on), never from our IPs and never through Day3 or SES. Port 25 on the VPS
  does not matter for sending; replies come in over IMAP on 993.
- **The user is the sender.** Their name, their mailbox, their domain
  (provided domains are registered in their name). nvoke is the tool.
- **Plain text, no tracking.** No open pixel, no click redirects. They hurt
  inbox placement and the reply is the only number that counts.
- **Slow by default.** 30 a day per warmed mailbox at most, random gaps,
  the recipient's working hours. Sending faster is not a setting.
- **Nothing sends without a human starting it.** A campaign starts from the
  web app after a review; an autopilot campaign keeps going after that one
  start. Agents (API, MCP) can draft and read, not start.
- **Clearly illegal is blocked, not configurable.** No sends to recipients
  in Denmark or Germany (consent rules cover B2B). Every first email says who
  sent it and why, and every email can be stopped with one click.

## Words

- **Mailbox:** one address nvoke can send from and read replies in.
- **Campaign:** a list of leads, a sequence, a set of mailboxes, a schedule.
- **Sequence:** 2 to 4 steps. Step 1 goes out, later steps wait N days and
  go out in the same thread unless the lead replied, bounced or opted out.
- **Lead (in a campaign):** one verified `emails` row enrolled in a
  campaign, with its own written steps.
- **Message:** one email nvoke sent, or one reply it received.

## Step 0: before any sending code

- **Verification first.** Sending to `unknown` addresses burns mailboxes.
  Campaigns only accept `valid` addresses (and `catch_all` behind an
  explicit choice). The port 25 work in `docs/research/smtp-throughput.md`
  decides how many leads end up `valid`; it runs in parallel with step 1.
- **Secret storage.** Nothing is encrypted at rest today. Add
  `apps/server/src/crypto/secrets.ts`: AES-256-GCM, `seal(plain): string`
  and `open(sealed): string`, format `v1.<iv>.<tag>.<ciphertext>` (base64url),
  key from `SECRETS_KEY` (32 bytes, base64) in `env.ts` and `.env.example`.
  The version prefix allows a key rotation later. Tests: round trip, tamper
  fails, wrong key fails.
- **Legal rewrite** (can run beside step 1, must land before step 1 ships):
  see "Legal and copy" below.

## Step 1: the engine with connected mailboxes

### Data (`apps/server/migrations/1700_sending.sql`)

Same conventions as the other migrations: comment pointing at the spec,
RLS on with no policies, text status columns with check constraints,
`clerk_user_id text references accounts on delete cascade`.

`mailboxes`
- `id uuid`, `clerk_user_id`, `address` (lowercase), `display_name`.
- `provider text` check (`smtp`, `google`, `microsoft`), `source` check
  (`connected`, `provided`).
- `smtp_host`, `smtp_port`, `smtp_secure bool`, `imap_host`, `imap_port`,
  `username`, `secret text` (sealed password or, from step 2, sealed
  OAuth tokens).
- `daily_cap smallint` (default 30, max 50), `warm bool`, `ramp_started_at`.
- `status` check (`checking`, `active`, `paused`, `error`, `disconnected`),
  `status_reason`, `last_send_at`, `last_poll_at`, `last_uid bigint`,
  `uid_validity bigint`.
- `signature text`.
- unique `(clerk_user_id, address)`.

`campaigns`
- `id`, `clerk_user_id`, `name`, `status` check (`draft`, `writing`,
  `review`, `scheduled`, `sending`, `paused`, `done`, `canceled`).
- `search_id` (nullable, the search the leads came from).
- `steps jsonb`: `[{ waitDays, brief }]`, step 1 has `waitDays 0`.
- `schedule jsonb`: `{ days: [1..5], startHour: 9, endHour: 17 }` in the
  recipient's local time.
- `review_until timestamptz`: the one-hour review window.
- counters: `leads`, `sent`, `replied`, `bounced`, `opted_out`.
- `created_at`, `started_at`, `finished_at`.

`campaign_mailboxes`: `(campaign_id, mailbox_id)`.

`campaign_leads`
- `id`, `campaign_id`, `clerk_user_id`, `email_id` (references `emails`),
  `company_id`, `address`, `first_name`, `company_name`, `timezone`.
- `mailbox_id` (assigned at enroll, sticky so the thread stays in one
  mailbox).
- `status` check (`queued`, `active`, `replied`, `bounced`, `opted_out`,
  `failed`, `done`, `skipped`), `skip_reason`.
- `next_step smallint`, `next_send_at timestamptz`.
- `thread_message_id text` (the Message-ID of step 1, for threading).
- unique `(campaign_id, address)`.
- index `(next_send_at) where status in ('queued','active')`.

`campaign_steps_written`: `(campaign_lead_id, step, subject, body,
edited bool)`. The emails the AI wrote, one row per lead per step, editable
in review.

`messages`
- `id`, `clerk_user_id`, `mailbox_id`, `campaign_id`, `campaign_lead_id`.
- `direction` check (`out`, `in`), `kind` check (`step`, `reply`,
  `auto_reply`, `bounce`, `other`).
- `message_id`, `in_reply_to`, `subject`, `from_address`, `to_address`,
  `body_text` (replies only; outgoing bodies live in
  `campaign_steps_written`), `step smallint`, `sent_at` or `received_at`.
- `smtp_response text` for outgoing.
- index on `message_id`.

`send_suppressions` (per account, does not erase leads)
- `clerk_user_id`, `hash` (sha256 of the address, same as
  `suppression.ts`), `reason` check (`unsubscribe`, `bounce`, `complaint`,
  `manual`), `created_at`, primary key `(clerk_user_id, hash)`.

Why a separate table: `suppress()` in `apps/server/src/leads/suppression.ts`
deletes the address from every user's `emails`. An opt-out from one
campaign is an objection to that sender, so it goes in `send_suppressions`.
An unsubscribe also writes to the global list with a new source
`unsubscribe` only when the person uses the global opt-out page, which
exists already.

`send_usage`: `(clerk_user_id, period 'YYYY-MM', sent int)`, the meter for
billing (see "Billing").

Jobs: add `write` and `send` to `jobs_type_check` (drop and re-add, as the
earlier migrations do).

### Shared schemas (`packages/shared/src/sending.ts`)

Zod schemas, re-exported from `index.ts`, used by server, web and desktop:

- `Mailbox`, `ConnectMailboxRequest` (`address`, `displayName`, `smtpHost`,
  `smtpPort`, `imapHost`, `imapPort`, `username`, `password`, `warm`),
  `UpdateMailboxRequest` (`displayName`, `dailyCap`, `signature`, `status`
  paused or active).
- `MailboxPreset`: a list of known hosts (Google Workspace, Microsoft 365,
  Zoho, Fastmail, iCloud, Namecheap Private Email, generic) so the form fills
  host and port from the domain's MX.
- `Campaign`, `CreateCampaignRequest` (`name`, `searchId` or `emailIds`,
  `steps`, `schedule`, `mailboxIds`), `UpdateCampaignRequest`.
- `CampaignLead`, `WrittenStep`, `UpdateWrittenStepRequest`.
- `Message`, `ReplyListResponse`.
- `SendingSummary` (sent this period, allowance, mailboxes active, daily
  capacity).
- Constants: `DEFAULT_DAILY_CAP = 30`, `MAX_DAILY_CAP = 50`,
  `MAX_STEPS = 4`, `REVIEW_MINUTES = 60`, `BLOCKED_COUNTRIES = ['DK','DE']`.

### Server modules (`apps/server/src/sending/`)

One folder, one file per job:

- `mailbox-transport.ts`: the only file that talks SMTP and IMAP. An
  interface `MailTransport { send(msg): Promise<SendResult>; poll(sinceUid):
  Promise<Incoming[]>; check(): Promise<CheckResult> }` with an SMTP and IMAP
  implementation (`nodemailer` for sending, `imapflow` and `mailparser` for
  reading) and a fake for tests. Step 2 adds OAuth implementations behind
  the same interface.
- `mailboxes.ts`: connect (check SMTP login, IMAP login, send a test email
  to the mailbox itself and see it arrive, check SPF, DKIM and DMARC of the
  domain with the code behind the SPF and DMARC checker tool), update,
  pause, delete, `capacityToday(mailbox)` (cap, minus sent in the last 24
  hours, with the ramp for unwarmed mailboxes: 5 a day, plus 3 a day, up
  to the cap).
- `write.ts`: the `write` job. For a batch of campaign leads, ask
  `ai.structured` (tier `bulk`, Haiku) for
  every step: subject and body, from the site profile
  (`getSiteProfile`), the company's opener and quote, the person's name and
  title, and the step's brief. Rules in the prompt: plain text, under 120
  words, no links in step 1, no claims not in the profile or on the page,
  the opt-out line and the "why you" line (see Legal). Validate the answer
  with zod, store in `campaign_steps_written`. Uses the AI budget in
  `ai/usage.ts`; a campaign that would exceed it is refused up front.
- `schedule.ts`: pure functions, the heart of the tests.
  `nextSendAt(lead, step, schedule, now)` (recipient timezone, working
  hours, a random offset), `pickDue(leads, mailboxes, now)` (respects each
  mailbox's capacity, spreads a mailbox's sends over the day with gaps of
  at least 4 minutes, one domain at most 2 sends per mailbox per day).
- `sender.ts`: the `send` tick. Every 30 seconds, claim due
  `campaign_leads` with `for update skip locked`, check suppression (global
  and per account), the country gate, the meter and the mailbox state, then
  send through the transport and write the `messages` row. Step 1 sets
  `thread_message_id`; later steps set `In-Reply-To` and `References` and
  reuse the subject with `Re:`. Headers: `List-Unsubscribe` with an https
  URL and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- `poller.ts`: the IMAP tick. Every 3 minutes per active mailbox, fetch
  messages after `last_uid` in INBOX (and the spam folder, to catch replies
  filtered there). Classify each with `classify.ts`, write `messages`, update
  the lead.
- `classify.ts`: pure. Bounce if it is a delivery status report or from a
  mailer daemon (parse `Final-Recipient` and the status code; 5.x.x is a
  hard bounce). Auto reply if `Auto-Submitted` is not `no`, or
  `X-Autoreply`, or common out of office subjects. Reply if `In-Reply-To` or
  `References` matches a sent `message_id`, or the sender is an active lead
  of this mailbox. Else `other`, ignored.
- `outcomes.ts`: what each class does.
  - Reply: lead `replied`, stop its sequence, count it.
  - Hard bounce: lead `bounced`, `send_suppressions` (`bounce`), the
    `emails` row marked `invalid`, the mailbox's bounce count.
  - Auto reply: push `next_send_at` by 3 days, no stop.
  - Words like "unsubscribe", "remove me", "stop" in a reply: `opted_out`
    and `send_suppressions` (`unsubscribe`).
- `health.ts`: per mailbox over the last 7 days. Pause the mailbox at 3%
  hard bounces or on an SMTP auth failure, pause the campaign when all its
  mailboxes are paused. Writes `status_reason` in words the user can act on.
- `unsubscribe.ts`: signed tokens (HMAC with `SECRETS_KEY` derived key,
  carrying the message id), the public route `GET` and `POST
  /u/:token` (one-click per RFC 8058, a plain page that says it is done).
- `gate.ts`: the country gate. Recipient country from the company's
  location, else from a country code top-level domain. Blocked countries
  are skipped with `skip_reason 'country'` at enroll, never sent.

Worker wiring (`apps/server/src/worker/`):
- `write` is a normal job type: add it to `JobType`, `DEFAULT_TIMEOUTS`,
  `caps`, the claim order and `execute()` in `runner.ts`.
- The sender and poller are ticks in `worker/index.ts`, like `runWebhooks`
  and `runFeed`: a `setInterval` with a busy flag, cleared on shutdown.
- Retention (`leads/retention.ts`): reply bodies 12 months, then purge;
  `messages` metadata 24 months; written steps deleted 30 days after a
  campaign ends.

### API (`apps/server/src/api/routes/sending.ts`)

Registered in `api/app.ts` like `dropsRoutes`, behind `requireAuth` and
`requireUser`. Every route goes in `packages/shared/src/catalog.ts` under a
new group `Sending`.

- `GET /v1/mailboxes`, `POST /v1/mailboxes` (connect, returns `checking`,
  the check runs in the background), `PATCH /v1/mailboxes/:id`,
  `DELETE /v1/mailboxes/:id`, `POST /v1/mailboxes/:id/check`.
- `GET /v1/campaigns`, `POST /v1/campaigns` (creates a `draft`, enrolls
  leads, applies gate and suppression, queues `write` jobs, moves to
  `writing` then `review`), `GET /v1/campaigns/:id`, `PATCH
  /v1/campaigns/:id`, `DELETE /v1/campaigns/:id`.
- `POST /v1/campaigns/:id/start` (Clerk session only:
  `requireClerkSession`; sets `review_until` an hour out, then `scheduled`),
  `POST /v1/campaigns/:id/pause`, `POST /v1/campaigns/:id/resume`.
- `GET /v1/campaigns/:id/leads`, `GET /v1/campaigns/:id/leads/:leadId`
  (with written steps and messages), `PATCH
  /v1/campaigns/:id/leads/:leadId/steps/:step` (edit a written email),
  `POST /v1/campaigns/:id/leads/:leadId/stop`.
- `GET /v1/replies` (all replies across campaigns, newest first).
- `GET /v1/sending` (`SendingSummary`).

MCP tools in the catalog: `list_mailboxes`, `list_campaigns`,
`create_campaign` (draft only), `get_campaign`, `list_replies`. No start,
no send. `MCP_INSTRUCTIONS` changes from "never sends" to "drafts
campaigns; a person starts them in the web app".

Webhook events (`apps/server/src/webhooks/events.ts`): `campaign.started`,
`campaign.finished`, `reply.received`, `lead.bounced`, `lead.opted_out`.

### Web app (`apps/site`)

- Routes: `app/app/mailboxes`, `app/app/campaigns`, `app/app/campaigns/new`,
  `app/app/campaigns/[id]`, `app/app/replies`. Thin pages as today.
- Screens in `components/app/sending/`:
  - `mailboxes-screen`: list with status LED, today's sends against
    capacity, connect dialog (address first, then the preset fills the
    rest, password last), the check result in plain words.
  - `campaign-new`: pick a search (or the selection from the results
    screen: a new "Send" action there), the steps with briefs and waits,
    the schedule, the mailboxes, a count of who is skipped and why
    (not valid, suppressed, country).
  - `campaign-screen`: the review list (every lead, every written email,
    edit in place), the start button with the hour of review, then
    progress: sent, replied, bounced, opted out, per lead state.
  - `replies-screen`: the replies inbox, each linked to its lead and thread.
- Data: hooks in `lib/app/queries.tsx` with the keys `mailboxes`,
  `campaigns`, `campaign`, `replies`, `sending`; polling rules in
  `lib/app/sending.ts` with tests next to it (poll every 2 seconds while
  `writing`, every 30 while `sending`, never when `done`).
- Navigation: Campaigns and Replies next to Searches and Drops.

### Desktop (`apps/desktop`)

Same screens in `renderer/src/screens/` once the web app has them, through
the existing `window.nvoke.request` bridge (no new IPC). A native
notification on `reply.received` (the desktop already notifies for drops).
Specs in `docs/desktop/sending.md`.

### Billing

The plan meters verified emails. Sending needs its own meter. Proposal,
in the one ladder style of `plans.ts` (see open decision 1):

- Every plan gets a monthly send allowance next to its verified emails
  (for example 2 sends per verified email: free 100, the 1,000 plan 2,000,
  up to 200,000 on the top plan).
- `send_usage` counts sends; `sender.ts` checks it in the same transaction
  pattern as `chargeVerified` in `leads/quota.ts`. Over the allowance, the
  campaign pauses with "allowance used, upgrade or wait for the next month".
- Shown in `GET /v1/me` (`usage.sent`, `sendAllowance`) and on the billing
  screens.

### Tests

- Unit: `secrets.ts`, `schedule.ts` (timezones, working hours, caps, ramp,
  gaps, daylight saving change), `classify.ts` (real bounce reports from
  Gmail, Microsoft, Postfix and Exim as fixtures; out of office samples in
  English, German, Spanish, French), `gate.ts`, unsubscribe tokens.
- Database (the existing embedded Postgres setup): enroll skips the right
  leads, sender claims with skip locked across two workers, a reply stops
  the sequence, a bounce suppresses and marks invalid, the meter stops at
  the allowance.
- Transport: the fake transport for all of the above; a test against
  `smtp-server` (npm) for the real SMTP path.
- Manual end to end before release: two test mailboxes we own
  (Workspace and Microsoft 365), a 3 step campaign to a third, a reply, a
  bounce to a made up address, an unsubscribe click.

### Done when

A user connects a Workspace mailbox with an app password, picks a finished
search, gets written emails for every valid lead, edits one, starts, and
sees sends spread over working hours in the recipients' timezones. A reply
stops that lead's follow-ups and shows in Replies. A bounce and an
unsubscribe stop and suppress. Nothing goes to Denmark or Germany. `pnpm
typecheck && pnpm lint && pnpm test` pass.

## Step 2: sign in with Microsoft and Google

Passwords and app passwords are the weak spot: Microsoft is switching off
password login for SMTP in Microsoft 365, and Google only allows app
passwords with two step sign-in on.

- **Microsoft (built 2026-10-27):** an Entra app registration (any
  organization and personal accounts, the `common` authority), delegated
  scopes `SMTP.Send`, `IMAP.AccessAsUser.All`, `offline_access`, `openid`,
  `profile`, `email`. Sending and reading over SMTP and IMAP with XOAUTH2,
  so the transport stays the same (`MailboxCredentials.accessToken`).
  `sending/oauth.ts` signs the state (bound to the user, 15 minutes),
  trades the code, reads the address from the id token and refreshes the
  access token 5 minutes before it runs out; the tokens are sealed as JSON
  in `mailboxes.secret`, `provider = 'microsoft'`. Routes:
  `POST /v1/mailboxes/oauth/microsoft/start` answers Microsoft's sign-in
  URL, the site's `/app/mailboxes/callback` posts `{ code, state }` to
  `POST /v1/mailboxes/oauth/microsoft` (both a Clerk session only).
  Signing in again with a connected address replaces its sign-in, so a
  password mailbox moves over and keeps its settings. A refused refresh
  pauses the mailbox with "Sign in with Microsoft again". A Microsoft 365
  tenant must still allow Authenticated SMTP and IMAP for the mailbox
  (admin center, Users, Mail, Manage email apps); the check says so.
  Env: `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`, the
  redirect is `{SITE_URL}/app/mailboxes/callback`. Publisher verification
  waits until sending is a customer feature.
- **Google:** an OAuth client with the scope `https://mail.google.com/`
  (XOAUTH2 over SMTP and IMAP). It is a restricted scope: Google app
  verification plus a yearly security assessment (CASA). Start the
  verification as soon as step 1 is in review; it is the slowest part of
  the whole plan. Until approved, the app runs as unverified for up to 100
  test users, and app passwords remain the default.
- Flow: the connect dialog offers "Sign in with Microsoft" or "Sign in
  with Google" first, the password form last. The OAuth callback lands on
  the site (`app/app/mailboxes/callback`), which posts the code to
  `POST /v1/mailboxes/oauth` with the Clerk session.
- New env: `GOOGLE_MAIL_CLIENT_ID`, `GOOGLE_MAIL_CLIENT_SECRET`,
  `MICROSOFT_MAIL_CLIENT_ID`, `MICROSOFT_MAIL_CLIENT_SECRET`.
- Done when: both providers connect, refresh on expiry, and show
  "reconnect" when the user revokes access.

## Step 3: mailboxes nvoke provides

Getlead's model: the user pays, nvoke sets up domains and warmed mailboxes.

- **Vendor first.** Pick one reseller with an API for domains, Google
  Workspace mailboxes and warmup. Candidates: InboxKit (has an API),
  Zapmail, Premium Inboxes. The choice needs: an API for buying domains
  and mailboxes, credentials we can use over SMTP and IMAP (or OAuth),
  warmup included or through API, and a clean answer on whose name the
  domains are in. Write the comparison into this file before coding.
- **Flow:**
  1. The user's domain (`acme.com`) gives suggestions (`getacme.com`,
     `acmehq.com`, `tryacme.com`); availability checked through the vendor.
  2. They pick domains and a mailbox count (3 per domain), names from
     their profile, pay.
  3. The `provision` job buys domains, sets SPF, DKIM, DMARC and a
     redirect of the bare domain to their real site, creates mailboxes,
     adds them as `source 'provided'`, `warm false`.
  4. Warmup runs 14 to 28 days before cold sends. The ramp in
     `capacityToday` respects it; campaigns can be created meanwhile.
- **Code:** `sending/provision/` with a `Provider` interface and one
  vendor implementation; a `provision` job; `provided_orders` table
  (domains, mailboxes, vendor ids, cost, status).
- **Billing:** a monthly price per mailbox passed through with a margin
  (open decision 2). Cancelling releases mailboxes at the end of the
  period; domains stay the user's.
- **Health:** a paused provided mailbox can be replaced by a new one on
  a new domain, one click.
- Done when: a user without any mailbox goes from "Get mailboxes" to a
  sending campaign without touching DNS.

## Step 4: AI on replies, meetings

- **Labels:** every reply gets a label with `ai.structured` (tier `bulk`):
  `interested`, `question`, `not_now`, `not_interested`, `wrong_person`
  (with the person named, if any), `unsubscribe`. Shown in Replies, filter
  by label. `unsubscribe` acts as in step 1.
- **Drafted answers:** for `interested` and `question`, a drafted reply
  from the site profile and the thread. The user edits and sends it from
  Replies through the same mailbox and thread.
- **Auto send:** off by default. When on, drafts for `interested` go out
  after a delay the user sets, during working hours.
- **Meetings:** a booking link in the site profile (Cal.com, Calendly or
  any URL). Drafts for `interested` offer it. No calendar integration in
  this step.
- **Not now:** a reminder date, the lead comes back into Replies then.
- **Wrong person:** offers to add the named person as a new lead if nvoke
  finds their address.
- Done when: replies are labeled within a minute of arriving and an
  interested reply can be answered with a booking link in two clicks.

## Legal and copy (before step 1 ships)

nvoke stops being "a research tool that never sends". Everything that
says so changes in one commit:

- `docs/legal/lia.md`, `dpia.md`, `ropa.md`, `article-14.md`: nvoke now
  writes and sends on the customer's instructions. The customer is the
  sender and controller for outreach; nvoke is their processor for sending
  and a controller for the lead data, as now. New safeguards to record: the
  country gate, the "why you" line, per-sender opt-outs, verification
  before sending, no tracking, caps.
- `docs/legal/lawyer-brief.md`: new questions for the lawyer about the
  processor role in sending, the Danish co-liability, and the UK and US
  footing.
- **The "why you" line** in every first email, written into the prompt:
  where the address came from (the company's site, a named page) and how
  to stop. This is the Art 14 notice delivered by the sender, which
  `article-14.md` named as the Cognism model.
- Customer terms (`apps/site/app/terms/page.tsx`): the customer is the
  sender, must follow the law of the recipient's country, may not send to
  personal consumer addresses, accepts the gate and caps; nvoke can pause
  any campaign.
- Site copy: the FAQ in `apps/site/app/page.tsx`, `/tools`, the agents and
  webhook docs pages, `lib/agent-docs.ts`, `lib/app/openers.ts`, the export
  notice dialogs.
- Catalog and code: `MCP_INSTRUCTIONS` and `draft_openers` in
  `packages/shared/src/catalog.ts`, the comment in
  `apps/server/src/openers/openers.ts`, `packages/shared/src/leads.ts`.
- Specs: `docs/SPEC.md` (privacy positioning, openers), `docs/desktop/openers.md`.
- The launch video line "We find. You send." gets a new cut later.

## Open decisions for the owner

1. **How sending is paid.** The proposal above: a send allowance inside
   each plan, so the one ladder stays. The alternative is Getlead's
   prepaid credits per send, which Clerk Billing does not do; it would need
   Stripe Checkout next to Clerk.
2. **Price of provided mailboxes.** Cost is about $3 a mailbox and $1 a
   domain a month. Getlead charges $39 for 3. Pass through at cost, or
   with a margin?
3. **Auto send of AI replies in step 4.** Off by default is the proposal.
4. **catch_all addresses.** Allowed in campaigns behind a choice, or never?

## Order of work

Step 0 and the legal rewrite first. Step 1 in this order, each a commit
that passes the checks: migration and shared schemas, secrets, transport
with the fake, mailboxes and their routes, write job, schedule and
sender, poller, classify and outcomes, unsubscribe and gate, health,
billing meter, web screens, catalog and MCP, desktop screens. Step 2 can
start (the Google verification paperwork) as soon as step 1's mailbox
routes exist. Step 3 starts with the vendor comparison. Step 4 needs step
1's Replies.
