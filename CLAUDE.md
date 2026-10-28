# nvoke

Lead finder. Electron desktop app, a Next.js site with the web app, and a Node
backend (API and worker) on a VPS. pnpm workspaces, TypeScript everywhere,
Node 24. Behaviour is in `docs/SPEC.md`; read the doc for the area you touch.

## Layout

- `apps/desktop`: Electron via electron-vite. `src/main`, `src/preload`,
  `src/ipc/contract.ts` (typed IPC), `src/renderer` (React, Tailwind v4,
  shadcn/ui). One file per feature so parallel work does not collide:
  `src/ipc/features/<f>.ts`, `src/preload/features/<f>.ts`,
  `src/main/features/<f>.ts` (registers on `MainContext`),
  `renderer/src/screens/account/`, `src/main/capture/shots/` and
  `docs/desktop/<f>.md`. A new feature adds its files and one line to each
  list. Window, tray and capture: `docs/desktop/window.md`. Sign-in and data
  flow: `docs/desktop/sign-in.md`.
- `apps/server`: `src/api` (Fastify), `src/worker` (Postgres job queue: find,
  crawl, verify), `src/leads` (sources, crawler, verifier, quotas, CSV),
  `src/feed` (launch collectors, daily drops), `src/webhooks`, `src/sending`
  (outbound email, internal to nvoke only, `docs/sending/plan.md`), `src/db`,
  `src/cli.ts`, `migrations/` (numbered `.sql`, applied in order).
- `apps/site`: Next.js App Router on Vercel (root `apps/site`). Marketing
  pages (static), the web app (`app/app`, `components/app`, `lib/app`, see
  `docs/web-app.md`), sign in and up, and the desktop sign-in and billing
  under `app/desktop`. Clerk runs only on those routes and `/claim`
  (`proxy.ts`).
- `apps/video`: product videos (Remotion). Read `docs/video.md` first.
- `packages/shared`: zod schemas for every request and response. Change the
  schema here first, then both sides. `@nvoke/shared/crawl` holds the crawl
  rules the server crawl and the desktop local crawl share.
- `packages/theme`: `theme.css` plus `field.css` (the Field look), imported
  by both the desktop and the site.
- `deploy/`: systemd units and the VPS runbook. Plain Node in `/opt/nvoke`,
  secrets in `/opt/nvoke/.env`. No Docker.

## Commands

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test   # run before calling work done
pnpm build
pnpm dev:api | dev:worker | dev:desktop | dev:site   # site on port 3001
pnpm --filter @nvoke/server cli db     # local embedded Postgres for dev
pnpm --filter @nvoke/server cli search local "dentists" "Aarhus" --limit 5
pnpm --filter @nvoke/desktop capture   # screenshots every screen
pnpm migrate                           # needs DATABASE_URL
pnpm dist:desktop
pnpm release 0.2.0                     # ship the desktop app (docs/desktop/updates.md)
```

`pnpm lint` includes `scripts/check-punctuation.mjs`. `pnpm test` starts an
embedded Postgres (no Docker); `TEST_DATABASE_URL` points at a real one.

## How things connect

- Workspace packages export source under the `@nvoke/source` condition, so
  dev and typecheck need no build.
- Desktop bundles every dependency, so the packaged app ships no
  `node_modules`. Add renderer and main deps as devDependencies.
- Auth: Clerk is the identity provider. Every client sends `Authorization:
  Bearer`: Clerk JWT (site), device token `nvk_dt_` (desktop), API key
  `nvk_sk_` (scripts), Clerk OAuth (MCP). `src/api/auth.ts` accepts each.
  Protect a route with `{ preHandler: app.requireAuth }` and read `req.auth`.
- API catalog: `packages/shared/src/catalog.ts` lists every endpoint, error
  code and MCP tool. OpenAPI, MCP, `/docs`, `/llms.txt` and `/agents.md` are
  built from it. Add a route there when you add it to the server; a test
  fails otherwise.
- Pricing: one plan, priced by verified emails a month (`plans.ts`). Change a
  price in `plans.ts` and in the Clerk Billing dashboard together. Details in
  `docs/SPEC.md`, "Plans".

## Hard rules

1. **Theme tokens only in the UI.** Never hardcode palette colors
   (`bg-zinc-900`, `text-white`) or hex values. Use shadcn tokens. ESLint
   enforces it. All colors live in `packages/theme`.
2. **Look.** An instrument panel in the Braun and Teenage Engineering line
   (`docs/desktop/look.md`, `docs/design/manual.md`): warm grey chassis,
   off-white plates, one signal orange, keycap buttons, a black dot matrix
   display, mono capital labels. Space Grotesk, JetBrains Mono, Doto. Radii 4
   to 8px. No liquid glass, no halos.
3. **No em dashes, en dashes or `--` as punctuation** anywhere. Rewrite the
   sentence.
4. **Electron security.** `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`. The renderer reaches main only through `window.nvoke`.
   Every new channel goes in the feature's contract, its preload bridge and a
   main handler that validates input.
5. **No secrets in the renderer.** Only `VITE_` variables reach it.
6. **Database is Postgres 18 on the VPS**, localhost only (deploy/README.md).
   Development uses local embedded Postgres, never production.
7. **Keep `.env.example` files current.** Never commit real values.
