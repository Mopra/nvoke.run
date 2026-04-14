> **Part of the nvoke project** — one product across three repos:
> - [nvoke.run](https://github.com/Mopra/nvoke.run) — product (web app + API)
> - [nvoke.run.website](https://github.com/Mopra/nvoke.run.website) — marketing site (nvoke.run)
> - [nvoke.run.docs](https://github.com/Mopra/nvoke.run.docs) — documentation (docs.nvoke.run)
>
> See [PROJECT.md](https://github.com/Mopra/nvoke.run.website/blob/main/PROJECT.md) for the full project overview.

---

# nvoke

Minimal tool for writing and running small HTTP-native Node.js functions. Each
function is a single file that receives a normalized HTTP request and returns
an HTTP response, exposed at a stable `/f/:slug` endpoint you can call as a
real webhook, callback URL, or tiny API.

## Function shape

```js
export default async function (req, ctx) {
  ctx.log("got", req.method, req.path);
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true, echoed: req.body }
  };
}
```

`req` has `method`, `path`, `query`, `headers`, and parsed `body`. Returning a
bare object/array/string is fine — nvoke normalizes it into a JSON or text
response automatically.

## Configuring an endpoint

In the function detail page, open the **HTTP** tab to set:

- **Slug** — stable URL segment used by `/f/<slug>`
- **Access mode** — `public` (no auth) or `api_key` (requires `Authorization: Bearer nvk_...`)
- **Allowed methods** — any of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`
- **Enabled** — disabled endpoints return `404`

### Public endpoint

```
curl https://api.nvoke.run/f/uptime-sim
```

### API-key protected endpoint

```
curl -X POST https://api.nvoke.run/f/my-webhook \
  -H "Authorization: Bearer nvk_your_key" \
  -H "Content-Type: application/json" \
  -d '{"event":"ping"}'
```

## Stack

- Frontend: React + Vite, Tailwind, shadcn-style components, Monaco, Clerk.
- Backend: Node 20, TypeScript, Fastify, `pg`, Zod, Clerk.
- Database: Supabase Postgres (same instance for dev and prod, or a separate prod project).
- Execution: `child_process.spawn('node', ['runner.mjs', ...])` with a 30s timeout and 128 MB heap cap.

## Dev

1. `cp .env.example .env` and fill in the `DATABASE_URL` (Supabase pooler, port 6543) and Clerk keys.
2. `npm install`
3. `npm -w apps/api run migrate`
4. In separate shells: `npm run dev:api` and `npm run dev:web`.
5. Open http://localhost:5173.

## Deployment (Coolify + Supabase)

Two resources in Coolify (api, web), one hosted database (Supabase).

### 1. Supabase (database)

Use a Supabase project for Postgres. Recommended: a separate project for prod so dev experiments can't corrupt prod data. Grab the **Transaction pooler** connection string (port `6543`) from Project Settings → Database → Connection string → "Transaction" tab. URL-encode any special characters in the password.

After Coolify deploys the API for the first time, run migrations once against the prod database — either via the API's pre-deploy command (set below) or manually with `DATABASE_URL=... npx -w apps/api tsx src/migrate.ts`.

### 2. API

- **Type:** Application → Node.js (Nixpacks build)
- **Branch:** `main`
- **Build command:** `npm ci && npm -w apps/api run build`
- **Pre-deploy command:** `npm -w apps/api run migrate`
- **Start command:** `node apps/api/dist/index.js`
- **Port:** `8080`
- **Domain:** `api.nvoke.run`
- **Environment variables:**
  ```
  DATABASE_URL=postgresql://postgres.<ref>:<encoded-pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
  CLERK_SECRET_KEY=sk_live_...
  CLERK_PUBLISHABLE_KEY=pk_live_...
  PORT=8080
  NODE_ENV=production
  ```

### 3. Web

- **Type:** Application → Static
- **Branch:** `main`
- **Build command:** `npm ci && npm -w apps/web run build`
- **Publish directory:** `apps/web/dist`
- **Domain:** `app.nvoke.run`
- **Routing:** enable SPA/history fallback in Coolify so direct requests like `/functions` serve `index.html` instead of nginx `404`.
  If using Coolify's generated nginx config, turn on SPA mode so requests fall back to:
  ```nginx
  try_files $uri $uri/ /index.html;
  ```
- **Build-time environment variables:**
  ```
  VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
  VITE_API_URL=https://api.nvoke.run
  ```

### Clerk production setup

In the Clerk dashboard, create a production instance, whitelist `https://app.nvoke.run` as a frontend origin, add the matching sign-in/sign-up redirect URLs, and use the production `pk_live_` / `sk_live_` keys in Coolify.

### Smoke test after deploy

1. `curl https://api.nvoke.run/api/health` → `{"ok":true}`
2. Open https://app.nvoke.run, sign up, create a function, run it.
3. Create an API key in `/settings`, then:
   ```
   curl -X POST https://api.nvoke.run/api/invoke/<function-id> \
     -H "Authorization: Bearer nvk_..." \
     -H "Content-Type: application/json" \
     -d '{"name":"world"}'
   ```

## Project layout

```
apps/web    React + Vite SPA
apps/api    Fastify server + runner.mjs (child-process executor)
```
