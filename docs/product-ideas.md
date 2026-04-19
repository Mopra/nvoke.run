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

## 1. Lightweight state and persistence

Some useful endpoint behaviors need small amounts of persistent state.

- [ ] Add lightweight key-value state per function or per user
- [ ] Keep the API tiny and predictable
- [ ] Use it for counters, toggles, intervals, and simulation state

Especially useful for test endpoints that need to alternate behavior across requests.

## Suggested order

1. Lightweight state and persistence

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
