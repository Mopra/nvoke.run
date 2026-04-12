# nvoke

Minimal tool for writing, running, and managing small Node.js functions.

## Stack

- Frontend: React + Vite, Tailwind, shadcn-style components, Monaco, Clerk.
- Backend: Node 20, TypeScript, Fastify, `pg`, Zod, Clerk.
- Database: Postgres (Supabase for dev, Coolify-managed in prod).
- Execution: `child_process.spawn('node', ['runner.mjs', ...])` with a 30s timeout and 128 MB heap cap.

## Dev

1. `cp .env.example .env` and fill in the `DATABASE_URL` (Supabase pooler, port 6543) and Clerk keys.
2. `npm install`
3. `npm -w apps/api run migrate`
4. In separate shells: `npm run dev:api` and `npm run dev:web`.
5. Open http://localhost:5173.

## Deployment (Coolify)

Three resources in Coolify, all pulling from this git repo.

### 1. Postgres

Coolify managed Postgres 16 with persistent volume and backups. Record the connection string — you'll paste it into the API's `DATABASE_URL`.

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
  DATABASE_URL=<postgres connection string>
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
- **Domain:** `nvoke.run`
- **Build-time environment variables:**
  ```
  VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
  VITE_API_URL=https://api.nvoke.run
  ```

### Clerk production setup

In the Clerk dashboard, create a production instance, whitelist `https://nvoke.run` as a frontend origin, and use the production `pk_live_` / `sk_live_` keys in Coolify.

### Smoke test after deploy

1. `curl https://api.nvoke.run/api/health` → `{"ok":true}`
2. Open https://nvoke.run, sign up, create a function, run it.
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
