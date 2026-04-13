# Product Ideas

Feature ideas for making nvoke better at the core promise: run simple functions effectively, easily, and cheaply.

## Current shape

The app already covers the MVP loop:

- Create, edit, and delete small Node.js functions
- Run functions from the UI
- Invoke functions over HTTP with API keys
- View a basic run history
- Inspect output, logs, and error state

That is a good base. The main gaps are the features that make these functions useful in real work without making the product heavier than it needs to be.

## Highest priority

## 1. HTTP-native functions

If nvoke should be useful in production, functions need to behave like real HTTP endpoints rather than code snippets wrapped in a fixed JSON envelope.

### Minimum runtime contract

Functions should be able to return a real HTTP response shape:

```js
export default async function (req, ctx) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true }
  };
}
```

The function should receive a real request shape:

```js
{
  method,
  path,
  query,
  headers,
  body
}
```

### Why this matters

This unlocks real production use cases:

- Webhook receivers
- Callback endpoints
- Lightweight APIs
- Health check simulators
- HTTP status code simulators for monitoring tools

### Minimum features

- [ ] Let functions return `status`, `headers`, and `body`
- [ ] Map that return value directly to the outgoing HTTP response
- [ ] Pass `method`, `path`, `query`, `headers`, and `body` into the function
- [ ] Support `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, and `OPTIONS`
- [ ] Add a stable function URL like `/f/:slug` or `/f/:id`

### Access modes

Not every function should require an API key.

- [ ] Support public endpoints
- [ ] Support protected endpoints with API key auth
- [ ] Support shared-secret style protection for webhook use cases later if needed

### Example use case: uptime status simulator

This should be possible with a single function:

```js
export default async function () {
  const minute = Math.floor(Date.now() / 60000);
  const phase = minute % 3;

  if (phase === 0) return { status: 200, body: "ok" };
  if (phase === 1) return { status: 429, body: "rate limited" };
  return { status: 500, body: "error" };
}
```

That one capability would make nvoke materially more useful for testing and production edge cases.

## 2. Environment variables and secrets

Real functions need API tokens, database URLs, webhook secrets, and service credentials.

- [ ] Add per-function environment variables
- [ ] Encrypt secrets at rest
- [ ] Show masked values in the UI
- [ ] Support secret updates without exposing raw values again

## 3. Dependency support

Single-file functions are fine for demos, but practical usage needs imports and npm packages.

- [ ] Support package dependencies per function
- [ ] Bundle or install dependencies before execution
- [ ] Cache builds so repeated runs stay cheap
- [ ] Keep the dependency model simple instead of turning this into full project hosting

## 4. Templates and quick starts

The fastest path to value is starting from a working example instead of a blank editor.

- [ ] Add one-click templates for webhook handlers, JSON transforms, fetch-based API calls, and cron-style jobs
- [ ] Pre-fill sample input for each template
- [ ] Add short inline guidance for `input` and `ctx.log`

## 5. Saved test cases

Simple functions are much easier to trust when users can save a few example inputs and rerun them quickly.

- [ ] Save named test cases per function
- [ ] Run a selected test case with one click
- [ ] Compare the latest output against expected output later if needed

## 6. Better run inspector

The app already stores most of the useful execution data. The UX should expose it better.

- [ ] Add a dedicated run detail view
- [ ] Show input, output, logs, error, duration, source, and timestamps together
- [ ] Add rerun from a previous invocation

## Next priority

## 7. Function versioning

Right now edits overwrite the latest code. That is risky even for a minimal tool.

- [ ] Save deployable versions or revisions
- [ ] Let users roll back to a previous version
- [ ] Show which version produced each invocation

## 8. Retention and debugging window

Invocations are currently pruned after one day. That is likely too short once people use this for real work.

- [ ] Increase retention or make it plan-based
- [ ] Keep metadata longer than raw payloads if cost matters
- [ ] Let users export or copy run details before pruning

## 9. Cost and usage visibility

If cheap is part of the value proposition, users need visibility into what they are consuming.

- [ ] Show runs per function
- [ ] Show average duration and recent failures
- [ ] Add a simple usage summary in settings or dashboard
- [ ] Keep pricing legible and predictable

## 10. Small sharing and handoff features

These are minor individually, but they reduce friction a lot.

- [ ] Copy invoke URL from the function page
- [ ] Copy ready-to-run curl snippets with the function ID filled in
- [ ] Duplicate a function
- [ ] Rename without opening the full editor if useful

## Lower priority

## 11. Scheduling and triggers

This becomes useful quickly, but it should not complicate the core product too early.

- [ ] Scheduled invocations
- [ ] Webhook-first trigger setup
- [ ] Minimal event logs for trigger failures

## 12. Lightweight state and persistence

Some useful endpoint behaviors need small amounts of persistent state.

- [ ] Add lightweight key-value state per function or per user
- [ ] Keep the API tiny and predictable
- [ ] Use it for counters, toggles, intervals, and simulation state

This is especially useful for test endpoints that need to alternate behavior across requests.

## 13. Team and collaboration features

Probably not needed before the single-user workflow is excellent.

- [ ] Shared workspaces
- [ ] Per-function access control
- [ ] Audit log for edits and key creation

## 14. Marketing site completeness

## Implementation path for HTTP functions

The smallest useful path is:

1. Extend the runtime contract so functions can return `status`, `headers`, and `body`
2. Add a new public route family for HTTP-native endpoints
3. Pass full request data into the function runtime
4. Add per-function access mode: `public` or `api_key`
5. Add stable per-function routes using slugs or IDs
6. Update invocation storage to record response status and headers
7. Add UI controls for method, path, auth mode, and example request payloads

This keeps nvoke small while turning it from a code runner into a practical micro-endpoint platform.

The public site should explain the simple value proposition clearly and convert fast.

- [ ] Add real `/pricing` content
- [ ] Add blog content or remove the blog nav until it exists
- [ ] Explain why nvoke is simpler than larger serverless platforms
- [ ] Show concrete examples of cheap, useful functions

## Suggested order

If prioritizing purely for product value:

1. Environment variables and secrets
2. Dependency support
3. Templates and quick starts
4. Saved test cases
5. Better run inspector
6. Function versioning
7. Cost and usage visibility
8. Retention improvements
9. Small sharing and duplication features

If prioritizing for production endpoint usefulness:

1. HTTP-native functions
2. Environment variables and secrets
3. Dependency support
4. Better run inspector
5. Templates and quick starts
6. Lightweight state and persistence
7. Saved test cases
8. Function versioning
9. Cost and usage visibility

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
