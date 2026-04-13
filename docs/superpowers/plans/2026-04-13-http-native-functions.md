# HTTP-Native Functions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn nvoke from a JSON-wrapped code executor into a true single-function HTTP endpoint platform. Functions should receive a normalized request object, return a normalized HTTP response object, and be invokable through stable endpoint URLs with configurable access mode and allowed methods.

**Architecture:** Keep the existing child-process executor model. Extend the runner payload to include full request data and injected env vars. Normalize function return values into an HTTP response shape in the runner, then map that response to Fastify replies in new endpoint routes. Add per-function HTTP configuration to the database and surface that config in the function detail UI. Extend invocation storage so runs capture request/response metadata for debugging.

**Tech Stack:** Node 20, TypeScript, Fastify, Zod, pg, React, Vite, Monaco, Clerk.

**Spec:** `docs/superpowers/specs/2026-04-13-http-native-functions-design.md`

**Codebase conventions picked up from exploration:**
- `apps/api` uses a simple SQL-first approach with migrations in `src/migrations/*.sql`, route handlers in `src/routes/*.ts`, and query helpers in `src/queries/*.ts`.
- The current executor pipeline is `routes -> executor.ts -> runner/runner.mjs`.
- `apps/web` keeps API access in `src/lib/api.ts` and page-level UI in `src/pages/*.tsx`.
- There is no meaningful frontend test harness configured. Verification should be `typecheck`, `build`, and manual browser testing.
- The app already has function detail, runs, and API key pages that can be extended rather than replaced.

**Implementation strategy:** Ship in vertical slices. First add schema support and runtime normalization. Then add the new HTTP endpoint route family. Then update the editor UI to configure and test HTTP functions. Finally, improve runs visibility and polish with templates and docs.

---

## File Structure

### API (new / modified)

- `apps/api/src/migrations/002_http_functions.sql` — add HTTP config fields and invocation metadata columns
- `apps/api/src/queries/functions.ts` — read/write slug, access mode, enabled state, and allowed methods
- `apps/api/src/queries/invocations.ts` — insert and list HTTP request/response metadata
- `apps/api/src/routes/functions.ts` — accept and return HTTP function config
- `apps/api/src/routes/invoke.ts` — adapt editor invoke to the new request/response model
- `apps/api/src/routes/http-functions.ts` — new stable HTTP endpoint route family
- `apps/api/src/index.ts` — register the new route family
- `apps/api/src/executor.ts` — send richer payload to the runner and receive normalized HTTP response
- `apps/api/src/runner/runner.mjs` — normalize request input and response output
- `apps/api/src/executor.test.ts` — extend tests for response normalization and error cases

### Web (modified)

- `apps/web/src/lib/api.ts` — types and request helpers for HTTP function config and request-builder invoke
- `apps/web/src/pages/FunctionDetailPage.tsx` — add HTTP config controls and request builder UI
- `apps/web/src/pages/FunctionsListPage.tsx` — surface slug / access-mode metadata if space allows
- `apps/web/src/pages/RunsPage.tsx` — show HTTP trigger kind, request method, and response status

### Web (new)

- `apps/web/src/components/HttpConfigPanel.tsx` — slug, access mode, methods, enabled state
- `apps/web/src/components/HttpRequestEditor.tsx` — method, headers, and body test builder
- `apps/web/src/components/HttpResponseView.tsx` — status, headers, and body view for latest run

### Docs

- `README.md` — update usage examples once the feature is shipped
- `docs/product-ideas.md` — already updated; no further changes required in this plan unless scope changes during implementation

---

## Task 1: Database schema for HTTP-native functions

**Files:**
- Create: `apps/api/src/migrations/002_http_functions.sql`

- [ ] **Step 1: Add HTTP config columns to `functions`**

Create a new migration file `apps/api/src/migrations/002_http_functions.sql` that adds:

- `slug text unique`
- `access_mode text not null default 'api_key'`
- `enabled boolean not null default true`

Add a check constraint so `access_mode` is limited to `public` or `api_key`.

- [ ] **Step 2: Add method configuration table**

In the same migration, create `function_http_methods`:

```sql
CREATE TABLE function_http_methods (
  function_id uuid NOT NULL REFERENCES functions(id) ON DELETE CASCADE,
  method text NOT NULL,
  PRIMARY KEY (function_id, method),
  CHECK (method IN ('GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'))
);
```

Seed existing functions with a default method set of `POST` so no current behavior is silently broken.

- [ ] **Step 3: Extend `invocations` for HTTP metadata**

Add these columns:

- `trigger_kind text not null default 'editor'`
- `request_method text`
- `request_path text`
- `request_headers jsonb`
- `response_status integer`
- `response_headers jsonb`
- `response_body_preview text`

Add a check constraint on `trigger_kind` for `editor` and `http`.

- [ ] **Step 4: Run migrations locally**

Run:

```bash
npm -w apps/api run migrate
```

Expected: the new migration applies cleanly.

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/api/src/migrations/002_http_functions.sql
git commit -m "feat(api): add http-native function schema"
```

---

## Task 2: Query layer support for HTTP config

**Files:**
- Modify: `apps/api/src/queries/functions.ts`

- [ ] **Step 1: Extend the function types**

Update the exported function interface so it includes:

- `slug: string | null`
- `access_mode: "public" | "api_key"`
- `enabled: boolean`
- `methods?: string[]`

The exact shape can be split between base DB row types and API-facing DTOs if cleaner.

- [ ] **Step 2: Return methods with function reads**

Update function queries so both list and detail reads can include allowed methods. Prefer a small helper query over embedding complex array aggregation everywhere if it keeps the code easier to read.

Recommended end shape for API responses:

```ts
{
  id,
  name,
  code,
  slug,
  access_mode,
  enabled,
  methods: ["POST"]
}
```

- [ ] **Step 3: Update create and update helpers**

Allow `createFunction` and `updateFunction` to insert/update:

- `slug`
- `access_mode`
- `enabled`
- `methods`

Method updates should replace the full allowed-method set for the function.

- [ ] **Step 4: Add lookup helpers for public route resolution**

Add helper(s) such as:

- `getFunctionBySlug(slug)`
- `getFunctionHttpConfigById(id)` if needed

These should be readable without requiring a user ID, because public endpoints must resolve a function before auth checks.

- [ ] **Step 5: Typecheck API**

Run:

```bash
npm -w apps/api run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add nvoke.run/apps/api/src/queries/functions.ts
git commit -m "feat(api): add function http config queries"
```

---

## Task 3: Runner normalization for request and response

**Files:**
- Modify: `apps/api/src/runner/runner.mjs`
- Modify: `apps/api/src/executor.ts`
- Modify: `apps/api/src/executor.test.ts`

- [ ] **Step 1: Change executor input payload**

Update `execute` in `apps/api/src/executor.ts` so stdin payload becomes:

```json
{
  "request": {
    "method": "POST",
    "path": "/api/functions/<id>/invoke",
    "query": {},
    "headers": {},
    "body": { "name": "world" }
  },
  "env": {}
}
```

The exact env source can stay empty in this task if secrets are deferred, but the payload shape should support it now.

- [ ] **Step 2: Normalize the user return value in the runner**

In `runner.mjs`:

- Read the richer stdin payload
- Call the user function as `fn(request, ctx)`
- Normalize return values into:

```js
{
  status: 200,
  headers: { "content-type": "application/json; charset=utf-8" },
  body: { ok: true }
}
```

Support both full HTTP response objects and bare shorthand values.

- [ ] **Step 3: Validate response shape**

Reject invalid responses clearly:

- non-integer status
- status outside `100..599`
- non-object headers
- non-string header values
- unsupported body types such as functions or symbols

Return these as runner errors, not process crashes.

- [ ] **Step 4: Update the executor result type**

Extend `ExecResult` so success responses carry normalized HTTP response data, not just a plain `output` field.

Recommended shape:

```ts
type NormalizedHttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
};
```

Then success results become something like:

```ts
{ status: "success"; response: NormalizedHttpResponse; logs: string[]; duration_ms: number }
```

- [ ] **Step 5: Expand executor tests**

Add tests for:

- bare object shorthand -> `200` JSON response
- string body -> `text/plain`
- explicit status + headers
- invalid response shape -> error
- timeout still works

- [ ] **Step 6: Run API tests and typecheck**

Run:

```bash
npm -w apps/api run typecheck
npm -w apps/api run build
```

If there is a test script available, run it too. If not, build is sufficient here.

- [ ] **Step 7: Commit**

```bash
git add nvoke.run/apps/api/src/executor.ts nvoke.run/apps/api/src/runner/runner.mjs nvoke.run/apps/api/src/executor.test.ts
git commit -m "feat(api): normalize http responses in runner"
```

---

## Task 4: Editor invoke route compatibility

**Files:**
- Modify: `apps/api/src/routes/invoke.ts`
- Modify: `apps/api/src/queries/invocations.ts`

- [ ] **Step 1: Preserve the editor testing route**

Update `POST /api/functions/:id/invoke` so it sends the richer request payload into `execute`, but still returns a structured JSON envelope for the web editor.

Suggested response shape:

```json
{
  "invocation_id": "...",
  "status": "success",
  "response": {
    "status": 200,
    "headers": { "content-type": "application/json; charset=utf-8" },
    "body": { "ok": true }
  },
  "logs": [],
  "error": null,
  "duration_ms": 12
}
```

- [ ] **Step 2: Store request and response metadata**

Update invocation inserts to capture:

- `trigger_kind = 'editor'`
- request method/path/headers
- normalized response status/headers/body preview

Keep existing fields populated where they remain useful.

- [ ] **Step 3: Keep the legacy API-key invoke route working**

Update `POST /api/invoke/:id` to use the same normalized execution path. This route can remain JSON-wrapped for now, but should be marked as legacy in comments or follow-up docs.

- [ ] **Step 4: Typecheck API**

Run:

```bash
npm -w apps/api run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/api/src/routes/invoke.ts nvoke.run/apps/api/src/queries/invocations.ts
git commit -m "feat(api): adapt editor invoke to http response model"
```

---

## Task 5: Stable HTTP endpoint route family

**Files:**
- Create: `apps/api/src/routes/http-functions.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Add a new route module**

Create `apps/api/src/routes/http-functions.ts` to register the new public endpoint surface.

Minimum route set:

- `app.route({ method: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"], url: "/f/:slug", handler })`

Optionally add a temporary ID-based fallback route if rollout needs it.

- [ ] **Step 2: Resolve function and validate method**

In the handler:

1. Resolve function by slug
2. Return `404` if missing or disabled
3. Return `405` if the incoming method is not allowed

- [ ] **Step 3: Enforce access mode**

If `access_mode === 'public'`, allow the request through.

If `access_mode === 'api_key'`, require an `nvk_` bearer token using the same key verification path already present in `routes/invoke.ts`.

Refactor shared API-key verification into a reusable helper if that reduces duplication.

- [ ] **Step 4: Map Fastify request -> runtime request object**

Build and pass this object to `execute`:

- `method`
- `path`
- `query`
- normalized request headers
- parsed request body

- [ ] **Step 5: Map runtime response -> Fastify reply**

Use the normalized response from `execute` to:

- set response status
- set safe headers
- serialize the body correctly

Block unsafe hop-by-hop headers such as:

- `connection`
- `transfer-encoding`
- `content-length`
- `keep-alive`

- [ ] **Step 6: Store invocation metadata**

Persist runs with:

- `trigger_kind = 'http'`
- request method/path/headers
- response status/headers/body preview
- logs, duration, and error state

- [ ] **Step 7: Register the route module**

Import and register `httpFunctionsRoutes` in `apps/api/src/index.ts`.

- [ ] **Step 8: Manual smoke test with curl**

After local startup, verify at least:

1. Public function returns the actual configured status code
2. API-key protected function rejects unauthenticated requests
3. Allowed methods work and disallowed methods return `405`

- [ ] **Step 9: Commit**

```bash
git add nvoke.run/apps/api/src/routes/http-functions.ts nvoke.run/apps/api/src/index.ts
git commit -m "feat(api): add stable http function endpoints"
```

---

## Task 6: Functions API shape for HTTP config

**Files:**
- Modify: `apps/api/src/routes/functions.ts`

- [ ] **Step 1: Extend create/update schemas**

Update request schemas to allow:

- `slug`
- `access_mode`
- `enabled`
- `methods`

Validation rules:

- slug: lowercase URL-safe string, reasonable length cap
- access_mode: `public` or `api_key`
- methods: non-empty array of supported HTTP methods

- [ ] **Step 2: Return HTTP config in function payloads**

Make sure both list and detail responses include the new fields so the web app can render them without extra API calls.

- [ ] **Step 3: Handle slug uniqueness cleanly**

If a duplicate slug is submitted, return a clear validation error rather than a generic server error.

- [ ] **Step 4: Typecheck API**

Run:

```bash
npm -w apps/api run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/api/src/routes/functions.ts
git commit -m "feat(api): expose http function config in functions api"
```

---

## Task 7: Web API client and shared types

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add web-facing types**

Define or centralize types for:

- function HTTP config
- invoke request payload
- normalized HTTP response payload
- invocation summary fields used by the UI

- [ ] **Step 2: Keep `useApi` simple**

Do not over-abstract. The current `request()` helper is small and good enough. Add types and small helpers only where they clearly reduce duplication.

- [ ] **Step 3: Typecheck web**

Run:

```bash
npm -w apps/web run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add nvoke.run/apps/web/src/lib/api.ts
git commit -m "feat(web): add http function api types"
```

---

## Task 8: Function detail UI for HTTP config

**Files:**
- Create: `apps/web/src/components/HttpConfigPanel.tsx`
- Modify: `apps/web/src/pages/FunctionDetailPage.tsx`

- [ ] **Step 1: Add an HTTP config panel component**

Create `HttpConfigPanel.tsx` to edit:

- slug
- access mode
- enabled state
- allowed methods
- stable endpoint URL with copy button

Keep the component form-like and compact. Do not build a wizard.

- [ ] **Step 2: Load and save HTTP config with the function**

Extend `FunctionDetailPage` so the existing save flow persists both code and HTTP config in one request.

- [ ] **Step 3: Add endpoint visibility to the detail page**

Surface the live endpoint prominently enough that users understand each function is now a real HTTP endpoint.

Minimum:

- show URL
- show access mode
- show enabled/disabled state

- [ ] **Step 4: Manual browser verification**

Verify that:

- changing slug persists
- methods persist
- access mode persists
- endpoint URL updates correctly

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/web/src/components/HttpConfigPanel.tsx nvoke.run/apps/web/src/pages/FunctionDetailPage.tsx
git commit -m "feat(web): add function http config panel"
```

---

## Task 9: Function detail request builder and response viewer

**Files:**
- Create: `apps/web/src/components/HttpRequestEditor.tsx`
- Create: `apps/web/src/components/HttpResponseView.tsx`
- Modify: `apps/web/src/pages/FunctionDetailPage.tsx`

- [ ] **Step 1: Replace body-only testing with an HTTP request builder**

The right-side testing panel should capture:

- method
- headers JSON
- body JSON

Path can remain implicit from the function config in this first pass if that keeps the UI cleaner.

- [ ] **Step 2: Show normalized HTTP responses**

Replace the old output view with a response-oriented view that shows:

- response status
- response headers
- response body
- logs
- duration

- [ ] **Step 3: Preserve existing simple workflow**

The page should still feel fast for the common case. Avoid turning the testing panel into a heavy API client.

- [ ] **Step 4: Manual browser verification**

Verify:

- JSON validation still works
- latest response is clearly readable
- logs still appear
- error and timeout states are understandable

- [ ] **Step 5: Commit**

```bash
git add nvoke.run/apps/web/src/components/HttpRequestEditor.tsx nvoke.run/apps/web/src/components/HttpResponseView.tsx nvoke.run/apps/web/src/pages/FunctionDetailPage.tsx
git commit -m "feat(web): add http request builder and response viewer"
```

---

## Task 10: Runs page HTTP metadata

**Files:**
- Modify: `apps/web/src/pages/RunsPage.tsx`

- [ ] **Step 1: Surface HTTP fields in the runs table**

Add columns or compact metadata for:

- trigger kind
- request method
- response status

Keep the table readable. Prefer concise badges or monospace chips over adding too many wide columns.

- [ ] **Step 2: Add run detail visibility if needed**

If the current runs page does not yet show enough per-run detail, add at least a compact expandable detail or a follow-up note in the doc. Do not overbuild this if the page gets too large.

- [ ] **Step 3: Manual browser verification**

Verify that editor-triggered and HTTP-triggered runs are distinguishable.

- [ ] **Step 4: Commit**

```bash
git add nvoke.run/apps/web/src/pages/RunsPage.tsx
git commit -m "feat(web): show http invocation metadata in runs"
```

---

## Task 11: Docs and smoke test update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update product description**

Adjust README language so nvoke is described as a tool for writing and running small HTTP-native Node.js functions, not just generic code snippets.

- [ ] **Step 2: Add a public endpoint example**

Document a minimal function example plus a `curl` example for:

- public endpoint
- API-key-protected endpoint

- [ ] **Step 3: Final verification**

Run from repo root:

```bash
npm -w apps/api run build
npm -w apps/web run build
```

Then manually verify:

1. Create a function
2. Configure slug, access mode, and methods
3. Run from the editor
4. Hit the stable `/f/:slug` endpoint with `curl`
5. Confirm the runs page shows the request and response metadata

- [ ] **Step 4: Commit**

```bash
git add nvoke.run/README.md
git commit -m "docs: add http-native functions usage"
```

---

## Rollout Notes

- Keep the legacy `POST /api/invoke/:id` route during rollout so existing users and docs do not break immediately.
- Default existing functions to `api_key` access mode and `POST` so they stay private by default.
- Do not expose stack traces in raw HTTP responses. Store detailed errors only in internal run records.
- Defer env var management UI if needed, but keep the runtime contract ready for `ctx.env` from the start.

## Follow-Ups After This Plan

Not part of this implementation plan, but natural next steps:

- per-function secrets UI
- lightweight persistent state for counters and status toggles
- status simulator templates
- shared-secret auth mode
- endpoint-level rate limiting
- custom domains
