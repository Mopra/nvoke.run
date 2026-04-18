# Product Ideas

Feature ideas for making nvoke better at the core promise: run simple functions effectively, easily, and cheaply.

## Current shape

The app now covers:

- Create, edit, duplicate, and delete Node.js functions
- Run functions from the UI with full request/response editor
- Invoke functions over HTTP with API keys (and HTTP-native functions with `status`/`headers`/`body`)
- Saved test cases per function
- Dedicated run detail view with input, output, logs, error, duration, source, and timestamps
- Per-function encrypted environment variables / secrets
- npm dependency support with cached bundle builds
- One-click templates for common function shapes (webhook, JSON transform, fetch, cron-style)
- Function versioning with rollback and per-invocation version attribution
- Billing tiers with usage visibility (runs, duration, failures) and overage handling
- Copy invoke URL, copy curl snippet, duplicate function

The remaining work is the set of features that make these functions useful in real production work without turning the product into a full serverless platform clone.

## Highest priority

## 1. Retention and debugging window

Invocations are currently pruned aggressively. That is likely too short once people use this for real work.

- [x] Increase retention or make it plan-based — free 1d, nano 7d, scale 30d; enforced in `pruneOldInvocations` via `users.plan` join
- [x] Cap per-run log size to keep storage predictable — 64KB / 100-line cap in `runner.mjs` with truncation marker
- [ ] Let users export or copy run details before pruning

## Lower priority

## 2. Scheduling and triggers

This becomes useful quickly, but it should not complicate the core product too early.

- [x] Scheduled invocations — cron per function, leader-elected in-process Postgres poller; `trigger_kind='scheduled'` invocations
- [x] Webhook-first trigger setup — Stripe / GitHub / generic HMAC-SHA256 signature verification on `/f/:slug`
- [x] Minimal event logs for trigger failures — `trigger_events` table with kinds: `schedule_fired|skipped|error`, `webhook_received|rejected`

## 3. Lightweight state and persistence

Some useful endpoint behaviors need small amounts of persistent state.

- [ ] Add lightweight key-value state per function or per user
- [ ] Keep the API tiny and predictable
- [ ] Use it for counters, toggles, intervals, and simulation state

Especially useful for test endpoints that need to alternate behavior across requests.

## 4. Team and collaboration features

Probably not needed before the single-user workflow is excellent.

- [ ] Shared workspaces
- [ ] Per-function access control
- [ ] Audit log for edits and key creation

## 5. Marketing site completeness

The public site should explain the simple value proposition clearly and convert fast.

- [ ] Add blog content or keep the blog nav hidden until it exists
- [ ] Explain more clearly why nvoke is simpler than larger serverless platforms
- [ ] Show concrete examples of cheap, useful functions

## Suggested order

1. Retention and debugging window
2. Scheduling and triggers
3. Lightweight state and persistence
4. Team and collaboration features
5. Marketing site completeness

## Product principle

The biggest risk is drifting from a tiny function runner into a full serverless platform clone.

Keep the product centered on:

- One function
- One endpoint
- Fast iteration
- Real HTTP behavior
- Clear logs and output
- Predictable cost
- Minimal setup

Anything that adds power should preserve those constraints rather than dilute them.
