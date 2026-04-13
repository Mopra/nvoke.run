# HTTP-Native Functions

**Date:** 2026-04-13
**Status:** Approved design, pending implementation plan

## Problem

The current nvoke runtime is a code executor with an HTTP trigger, not a true HTTP function platform.

Today, every invocation is wrapped in a fixed JSON envelope by the API layer. User code cannot:

- Set the real HTTP status code
- Set response headers
- Return a raw text or HTML body
- Read the full incoming HTTP request shape
- Expose a stable public endpoint without API key auth

That makes the product fine for basic execution, but not yet useful for production endpoint use cases such as:

- Webhook receivers
- Callback URLs
- Small internal APIs
- Mock endpoints for integration tests
- HTTP status simulators for uptime monitoring tools

## Goal

Make each function capable of acting as a real HTTP endpoint while keeping the product small and easy to understand.

The target mental model is still:

- one function
- one endpoint
- one simple editor
- one clear execution log

Not in scope: turning nvoke into a general-purpose serverless platform with routing trees, infrastructure knobs, or multi-file services.

## Non-Goals

- Full Express-style request/response APIs
- Multi-route apps inside a single function
- Streaming responses in v1
- WebSockets, SSE, or long-lived connections
- Custom domains in this pass
- Team permissions or billing work
- General cron orchestration in this pass

## Product Behavior

Each function gets a stable HTTP endpoint and may be configured as either:

- `public` — callable with no auth
- `api_key` — callable with an nvoke API key

The function receives a normalized request object and returns a normalized response object.

### Request contract

```js
export default async function (req, ctx) {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true }
  };
}
```

`req` shape:

```js
{
  method: "GET",
  path: "/f/uptime-sim",
  query: { region: "us", verbose: "1" },
  headers: {
    "user-agent": "curl/8.0.1",
    "content-type": "application/json"
  },
  body: { ping: true }
}
```

`ctx` shape in v1:

```js
{
  log: (...args) => void,
  env: {
    EXAMPLE_SECRET: "..."
  }
}
```

### Response contract

Supported user return values:

1. Full HTTP response object:

```js
{
  status: 503,
  headers: { "content-type": "text/plain" },
  body: "temporary outage"
}
```

2. Bare value shorthand:

```js
return { ok: true };
```

This should normalize to:

```js
{
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: { ok: true }
}
```

### Body serialization rules

- `string` body -> `text/plain; charset=utf-8` unless user explicitly sets `content-type`
- `object` or `array` body -> JSON serialize with `application/json; charset=utf-8`
- `number`, `boolean`, `null` -> JSON serialize
- `undefined` -> empty body, status defaults to `204` only if explicitly returned in a response object; otherwise normalize to JSON `null` with `200` to avoid surprising behavior

### Supported methods

The platform should support:

- `GET`
- `POST`
- `PUT`
- `PATCH`
- `DELETE`
- `HEAD`
- `OPTIONS`

Method handling is configured per function.

## Example Use Cases

### Uptime status simulator

```js
export default async function () {
  const minute = Math.floor(Date.now() / 60000);
  const phase = minute % 3;

  if (phase === 0) return { status: 200, body: "ok" };
  if (phase === 1) return { status: 429, body: "rate limited" };
  return { status: 500, body: "error" };
}
```

### Webhook receiver

```js
export default async function (req, ctx) {
  ctx.log("received", req.headers["x-event-type"], req.body);
  return { status: 202, body: { accepted: true } };
}
```

### Tiny text endpoint

```js
export default async function () {
  return {
    status: 200,
    headers: { "content-type": "text/plain" },
    body: "hello from nvoke"
  };
}
```

## Endpoint Model

Each function should expose two invocation surfaces:

1. **Editor/test invoke**
   - Existing UI-driven invoke flow remains
   - Used for interactive testing in the app
   - Returns structured invocation details for the editor UI

2. **HTTP endpoint invoke**
   - New stable endpoint for real production traffic
   - Returns the function's actual HTTP response

### Public route shape

Preferred route shape:

- `/f/:slug`

Fallback if slug is absent or duplicate handling is deferred:

- `/f/:id`

Recommendation: support both, but make slug the primary product surface.

## Configuration Model

Each function gets HTTP config:

- `slug`
- `access_mode` = `public` | `api_key`
- `methods` = array of allowed methods
- `enabled` = boolean

Optional later:

- `timeout_ms` override
- request size cap override
- custom shared secret mode

## Backend Architecture

## Database changes

Add fields to `functions`:

- `slug text unique`
- `access_mode text not null default 'api_key' check (access_mode in ('public','api_key'))`
- `enabled boolean not null default true`

Method configuration should be stored separately to keep querying and validation straightforward.

New table: `function_http_methods`

- `function_id uuid not null references functions(id) on delete cascade`
- `method text not null`
- primary key `(function_id, method)`
- check method in supported HTTP method set

Invocation records should be extended to capture HTTP behavior.

Add fields to `invocations`:

- `trigger_kind text not null default 'editor' check (trigger_kind in ('editor','http'))`
- `request_method text`
- `request_path text`
- `request_headers jsonb`
- `response_status integer`
- `response_headers jsonb`
- `response_body_preview text`

Notes:

- Keep existing `source` field if needed for compatibility during migration, but the plan phase should decide whether to replace it with `trigger_kind` or keep both.
- `response_body_preview` should be truncated server-side to a safe size for storage and listing.

## Execution pipeline

The current executor writes user code to a temp file, spawns Node, passes JSON via stdin, and reads one JSON line back from the runner.

That overall model can stay.

What changes:

1. The runner input payload becomes a richer object:

```json
{
  "request": {
    "method": "GET",
    "path": "/f/demo",
    "query": { "a": "1" },
    "headers": { "accept": "*/*" },
    "body": null
  },
  "env": {
    "EXAMPLE_SECRET": "..."
  }
}
```

2. The runner normalizes the user return value into a validated HTTP response object.

3. The API route writes the actual status, headers, and body to the outgoing Fastify reply.

## Runner behavior

Runner responsibilities in v1:

- Load the user default export
- Ensure it is a function
- Provide `ctx.log`
- Provide `ctx.env`
- Validate the return value
- Normalize shorthand return values into the HTTP response shape
- Return `{ ok, response, logs, error }` to the parent process

The runner should reject invalid response objects with clear errors, for example:

- non-integer `status`
- `status` outside `100..599`
- non-object `headers`
- header values that are not strings
- unsupported body types such as functions or symbols

## API routes

### Existing routes retained

- `POST /api/functions/:id/invoke`
  - stays as the editor/testing invoke route
  - returns structured JSON for the app

- `POST /api/invoke/:id`
  - can remain for backwards compatibility in the short term
  - should be considered legacy once stable HTTP endpoints exist

### New routes

- `ALL /f/:slug`
- optionally `ALL /f/id/:id` or `ALL /f/:id` during rollout

Flow:

1. Resolve function by slug or id
2. Check `enabled`
3. Check allowed methods
4. Check access mode
5. Build normalized request payload
6. Execute user function
7. Store invocation metadata
8. Send actual HTTP response

### Auth behavior

For `public` functions:

- no auth required

For `api_key` functions:

- require `Authorization: Bearer nvk_...`

Future mode:

- `shared_secret` for webhook integrations where a static secret is more convenient than an API key

## UI Changes

## Functions list

Add visible endpoint metadata so the page better reflects what a function is.

- Show slug if present
- Show access mode badge
- Show enabled/disabled state

## Function detail

The function detail page should gain an HTTP config section or tab with:

- slug field
- access mode selector
- allowed method checklist
- enabled toggle
- stable endpoint URL with copy button

The existing right-hand panel should also support testing real HTTP requests.

### Input panel changes

Replace the current body-only JSON textarea with a small request builder:

- method selector
- path display or preview
- query string input or key/value editor later
- headers JSON textarea
- body JSON textarea

The editor invoke button should run against the same request model used by real HTTP traffic.

### Output panel changes

Show:

- response status
- response headers
- response body
- logs
- duration

This should feel like a tiny HTTP client plus function editor, not just a code playground.

## Runs page

The runs table should include:

- trigger kind (`editor` or `http`)
- request method
- response status
- endpoint slug or function name

Run detail should show the captured request and response metadata.

## Validation and Limits

The current runtime limits should remain in place unless explicitly changed in implementation planning:

- 30 second timeout
- 128 MB heap cap
- capped logs
- capped process output

Add explicit HTTP-specific limits:

- max response header size
- max serialized response body size
- max stored request/response preview size in the database

If limits are exceeded, return a platform-generated `500` response and store the run as error.

## Error Handling

There are two distinct failure classes:

### 1. User function failure

Examples:

- thrown error
- invalid return shape
- timeout

Behavior:

- invocation stored as failed
- public HTTP response should be `500`
- response body should be small and generic in production-facing mode to avoid leaking internals
- full details remain visible in the app run logs

### 2. Platform routing failure

Examples:

- function not found
- function disabled
- method not allowed
- missing auth

Behavior:

- `404` for unknown function
- `403` or `401` for auth failure depending on mode
- `405` for disallowed method
- `423` or `404` could be considered for disabled endpoints, but recommend `404` to keep disabled endpoints opaque

## Security Notes

- Header values must be sanitized to avoid response splitting behavior
- Certain hop-by-hop or unsafe headers should be blocked from user control in v1
  - `connection`
  - `transfer-encoding`
  - `content-length`
  - `keep-alive`
- `set-cookie` should be deferred unless cookie support is explicitly designed
- Public endpoints must not expose stack traces
- API-key-protected endpoints should still avoid leaking full stack traces in raw HTTP responses

## Scope Boundaries

**In scope:**

- HTTP-native response model
- Full request object passed into functions
- Stable public endpoint per function
- Public vs API-key access mode
- Per-function method configuration
- Invocation storage for request and response metadata
- Function detail UI for HTTP config and HTTP-style testing

**Out of scope:**

- custom domains
- path parameters and nested route trees
- shared-secret auth mode
- persistent key-value state
- scheduled invocations
- dependency installation changes beyond what already exists
- billing, plans, or quotas

## Open Questions for Planning Phase

- Should the legacy `POST /api/invoke/:id` route remain indefinitely or be replaced by `/f/:slug` over time?
- Should slugs be required for new functions, or auto-generated lazily?
- Is method configuration stored as a join table or a text array column?
- Should the editor invoke route always return the structured JSON envelope even when using the new request/response model? Recommendation: yes.
- How much request and response metadata should be retained by default to preserve low storage cost?
- Should public endpoints be rate-limited globally in v1?

## Suggested Implementation Order

1. Extend DB schema for slug, access mode, enabled state, method config, and HTTP invocation metadata
2. Extend runner payload and response normalization logic
3. Add new HTTP endpoint route family in Fastify
4. Update invocation persistence to store HTTP request and response metadata
5. Update function detail page to edit HTTP config and test request shape
6. Update runs page to surface HTTP request and response details
7. Add templates that showcase webhook receivers and status simulators

This sequence delivers real endpoint usefulness early while keeping the product surface area small.
