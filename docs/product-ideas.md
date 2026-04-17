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

## 1. Environment variables and secrets

Real functions need API tokens, database URLs, webhook secrets, and service credentials.

- [x] Add per-function environment variables
- [x] Encrypt secrets at rest
- [x] Show masked values in the UI
- [x] Support secret updates without exposing raw values again

## 2. Dependency support

Single-file functions are fine for demos, but practical usage needs imports and npm packages.

- [x] Support package dependencies per function
- [x] Bundle or install dependencies before execution
- [x] Cache builds so repeated runs stay cheap
- [x] Keep the dependency model simple instead of turning this into full project hosting

## 3. Templates and quick starts

The fastest path to value is starting from a working example instead of a blank editor.

- [x] Add one-click templates for webhook handlers, JSON transforms, fetch-based API calls, and cron-style jobs
- [x] Pre-fill sample input for each template
- [x] Add short inline guidance for `input` and `ctx.log`

## Next priority

## 4. Function versioning

Right now edits overwrite the latest code. That is risky even for a minimal tool.

- [x] Save deployable versions or revisions
- [x] Let users roll back to a previous version
- [x] Show which version produced each invocation

## 5. Retention and debugging window

Invocations are currently pruned aggressively. That is likely too short once people use this for real work.

- [ ] Increase retention or make it plan-based
- [ ] Keep metadata longer than raw payloads if cost matters
- [ ] Let users export or copy run details before pruning

## Lower priority

## 6. Scheduling and triggers

This becomes useful quickly, but it should not complicate the core product too early.

- [ ] Scheduled invocations
- [ ] Webhook-first trigger setup
- [ ] Minimal event logs for trigger failures

## 7. Lightweight state and persistence

Some useful endpoint behaviors need small amounts of persistent state.

- [ ] Add lightweight key-value state per function or per user
- [ ] Keep the API tiny and predictable
- [ ] Use it for counters, toggles, intervals, and simulation state

Especially useful for test endpoints that need to alternate behavior across requests.

## 8. Team and collaboration features

Probably not needed before the single-user workflow is excellent.

- [ ] Shared workspaces
- [ ] Per-function access control
- [ ] Audit log for edits and key creation

## 9. Marketing site completeness

The public site should explain the simple value proposition clearly and convert fast.

- [ ] Add blog content or keep the blog nav hidden until it exists
- [ ] Explain more clearly why nvoke is simpler than larger serverless platforms
- [ ] Show concrete examples of cheap, useful functions

## Suggested order

With secrets, dependencies, templates, and versioning shipped, the remaining prioritization is:

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
