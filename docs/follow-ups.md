# Post-MVP Follow-ups

Things to tackle after the initial MVP deploy. None are urgent — in priority order.

## 1. Real domains + TLS

Replace the `sslip.io` auto-domains with `nvoke.run` and `api.nvoke.run`.

- [ ] Point `nvoke.run` A record at the VPS IP (`187.77.85.132`)
- [ ] Point `api.nvoke.run` A record at the same IP
- [ ] In Coolify → `nvoke-web` → set custom domain `https://nvoke.run`
- [ ] In Coolify → `nvoke-api` → set custom domain `https://api.nvoke.run`
- [ ] Wait for Let's Encrypt cert issuance (Coolify auto-provisions)
- [ ] Update `VITE_API_URL` env var on `nvoke-web` to `https://api.nvoke.run`
- [ ] Redeploy `nvoke-web`
- [ ] Smoke test: sign in on `https://nvoke.run`, run a function, external invoke against `https://api.nvoke.run/api/invoke/<id>`

## 2. Tighten CORS

The API currently uses `origin: true` in `apps/api/src/index.ts` (reflects any origin). Fine for MVP; lock it down once domains are set.

- [ ] In [apps/api/src/index.ts](../apps/api/src/index.ts), change `await app.register(cors, { origin: true, credentials: true });` to `origin: ["https://nvoke.run"]` (or read from an env var `WEB_ORIGIN`)
- [ ] Commit + push, Coolify auto-deploys
- [ ] Verify the web app still works and external curl to `/api/invoke/:id` still works (CORS doesn't affect non-browser callers)

## 3. Clerk production instance

Currently using `pk_test_` / `sk_test_`. Test keys work forever but give you a Clerk-branded sign-in domain and don't support custom branding.

- [ ] In Clerk dashboard, create a **production** instance
- [ ] Whitelist `https://nvoke.run` as an allowed origin
- [ ] Configure any sign-in customization (logo, colors, etc.)
- [ ] Copy the new `pk_live_...` and `sk_live_...`
- [ ] Replace `CLERK_SECRET_KEY` + `CLERK_PUBLISHABLE_KEY` on `nvoke-api` in Coolify
- [ ] Replace `VITE_CLERK_PUBLISHABLE_KEY` on `nvoke-web` in Coolify (Build Time variable)
- [ ] Redeploy both resources
- [ ] Sign up a fresh user to verify

## 4. Separate Supabase project for prod

Right now dev and prod share the same Supabase database. Any dev experiment that drops a table or corrupts data kills prod. Fix this once you have real users or data you can't afford to lose.

- [ ] Create a new Supabase project `nvoke-prod`
- [ ] Grab its Transaction pooler connection string (port 6543)
- [ ] URL-encode the password
- [ ] Update `DATABASE_URL` on `nvoke-api` in Coolify to the new URL
- [ ] Run migrations against it: `DATABASE_URL=... npm -w apps/api run migrate` (or use Coolify's pre-deploy command and redeploy)
- [ ] Redeploy `nvoke-api`
- [ ] Keep the original Supabase project as dev-only
