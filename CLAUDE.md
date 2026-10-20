# nvoke

Lead finder. Electron desktop app plus a Node backend (API and worker) on a VPS.
pnpm workspaces, TypeScript everywhere, Node 24.

## Layout

- `apps/desktop`: Electron via electron-vite. `src/main` (main process),
  `src/preload` (bridge), `src/ipc/contract.ts` (typed IPC contract),
  `src/renderer` (React, Tailwind v4, shadcn/ui). Packaging in
  `electron-builder.yml` (nsis, dmg, AppImage, unsigned).
  One file per desktop feature, so parallel work does not collide: channels
  and types in `src/ipc/features/<feature>.ts` (merged by `contract.ts`), the
  bridge in `src/preload/features/<feature>.ts`, main wiring in
  `src/main/features/<feature>.ts` (each registers itself on the shared
  `MainContext`, `src/main/index.ts` only calls the register functions), the
  Account setting in `renderer/src/screens/account/`, capture shots in
  `src/main/capture/shots/` and the spec in `docs/desktop/<feature>.md`. A new
  feature adds its files and one line to each list.
- `apps/server`: `src/api` (Fastify, entry `src/api/index.ts`), `src/worker`
  (separate process, entry `src/worker/index.ts`: Postgres job queue and the
  find, crawl and verify handlers), `src/leads` (source adapters, crawler,
  verifier, quotas, CSV, the queries behind the routes), `src/feed` (the
  launch collectors the worker runs around the clock and daily drops), `src/webhooks`
  (user webhooks: URL guard, signing, the events the pipeline emits and the
  worker's sender), `src/db` (postgres.js
  client and migration runner), `src/cli.ts` (local searches and `cli db`),
  `migrations/` (numbered `.sql` files, applied in order: `0001_desktop_auth`,
  `0100_leads`, `0200_pricing`). Behaviour is in `docs/SPEC.md`.
- `apps/site`: Next.js (App Router): the marketing site, the web app and
  the desktop sign-in. Deploys to Vercel with root directory `apps/site`.
  The web app is the front door (see "Web app" below): `app/app` (routes),
  `components/app` (screens), `lib/app` (data layer and its tests). Sign in
  and sign up are `app/sign-in` and `app/sign-up`; the desktop sign-in and
  billing pages are under `app/desktop`. Clerk runs only on those routes and
  `/claim` (`proxy.ts`); the marketing pages stay static.
- `apps/video`: the product videos (Remotion). Takes are recorded from the
  real desktop app by `pnpm --filter @nvoke/desktop film`, sound is
  synthesized by `scripts/teaser-audio.py`. The style that works and the
  whole recipe are in `docs/video.md`; read it before making a video.
- `packages/theme`: `theme.css`, the single source of the shadcn color tokens
  (plus a few extras: `sidebar-material`, `glow`, `sheen`, `scrim`, layered
  shadows). Imported by the desktop renderer's `index.css` and the site's
  `globals.css`.
- `deploy/`: systemd units (`nvoke-api.service`, `nvoke-worker.service`) and
  the VPS runbook. Server runs as plain Node in `/opt/nvoke` under a dedicated
  `nvoke` user, with secrets in `/opt/nvoke/.env`. No Docker, no Coolify.
- `packages/shared`: zod schemas for every request and response between desktop
  and server. Change the schema here first, then both sides. The subpath
  `@nvoke/shared/crawl` holds the crawl rules both crawls share (domains,
  email extraction, page picking, app shell and bot wall detection): the
  server crawl and the desktop's local render crawl
  (`apps/desktop/src/main/local-crawl`, docs/desktop/local-crawl.md).

## Commands

```bash
pnpm install
pnpm typecheck        # all packages
pnpm lint             # eslint + scripts/check-punctuation.mjs
pnpm test             # vitest
pnpm build            # shared, server, desktop, site
pnpm dev:api          # tsx watch, reads apps/server/.env
pnpm dev:worker
pnpm dev:desktop      # electron-vite dev, reads apps/desktop/.env
pnpm --filter @nvoke/desktop capture   # screenshots every screen, light and dark
pnpm dev:site         # next dev on port 3001
pnpm migrate          # needs DATABASE_URL
pnpm --filter @nvoke/server cli db     # local embedded Postgres for dev:api and dev:worker
pnpm --filter @nvoke/server cli search local "dentists" "Aarhus" --limit 5
pnpm dist:desktop     # installer for the current OS
pnpm release 0.2.0    # desktop release: CHANGELOG section, bump, tag, push (docs/desktop/updates.md)
```

Run `pnpm typecheck && pnpm lint && pnpm test` before calling work done.

## How things connect

- Workspace packages export source under the `@nvoke/source` condition, so dev
  and typecheck never need a build. `tsconfig.build.json` in server turns the
  condition off and compiles against `packages/shared/dist`.
- Desktop bundles every dependency (all are devDependencies), so the packaged
  app ships no `node_modules`. Keep it that way: add renderer and main deps as
  devDependencies.
- Auth: Clerk is the identity provider. The site sends Clerk session JWTs,
  the desktop app an opaque device token (`nvk_dt_`), scripts and agents an
  API key (`nvk_sk_`) and MCP clients a Clerk OAuth token. All arrive as
  `Authorization: Bearer` and `src/api/auth.ts` in the server accepts each.
  Protect a route with `{ preHandler: app.requireAuth }` and read `req.auth`
  (`requireClerkSession` and `requireDeviceSession` narrow it). The
  preHandler also sets `req.userId` and creates the `accounts` row on the
  first authenticated request. The lead routes (`src/api/routes/leads.ts`)
  get `app.requireAuth` as their `authenticate` option and guard with
  `requireUser` (`src/api/user.ts`).
- API and agents: `packages/shared/src/catalog.ts` lists every endpoint,
  error code and MCP tool. The server builds `/v1/openapi.json` and the MCP
  tools (`POST /mcp`, `src/api/routes/mcp.ts`) from it and the site builds
  `/docs`, `/llms.txt` and `/agents.md` from it. Add a route there when you
  add it to the server; a test fails on a documented route that does not
  exist. Agents sign up alone with `POST /v1/agents/signup`
  (`src/agents/signup.ts`) and the owner claims on the site's `/claim`.
  Details in `docs/SPEC.md`, "API and agents".
- `GET /v1/me` returns `MeResponse`: the Clerk profile (`user`), how the
  request authenticated (`via`), and `plan`, `usage`, `maxSearchLimit` and
  `maxDropDailyLimit` (both per plan, `plans.ts`) from `accountSummary()`.
- Pricing: one plan for everyone, priced by verified emails a month. The
  ladder is `packages/shared/src/plans.ts`; each paid key is a Clerk Billing
  user plan slug. Checkout is on the site (`app/desktop/billing`, shown in
  the web app at `/app/billing`); the server
  reads the held plan from Clerk (`src/billing/clerk.ts`) and charges a
  verified email in the verify job (`chargeVerified` in `src/leads/quota.ts`),
  two for an email a Describe your customer search found (`emailWeight`).
  Change a price or allowance in `plans.ts` and in the Clerk dashboard
  together. Details in `docs/SPEC.md`, "Plans".
- Desktop data flow: the renderer calls `window.nvoke.request(method, path,
  body)` (paths under `/v1/` only) and `window.nvoke.exportCsv(searchId,
  name)`. Main answers both through `AuthSession.api`, which attaches the
  device token and flips to signed out on 401 (`src/main/api-bridge.ts`).
  `request` never rejects: `{ ok, status, data }` or `{ ok: false, status,
  error }`. Main also keeps a local copy of searches and companies in SQLite
  (`src/main/local`: `node:sqlite`, synced in the background, wiped on sign
  out) that the renderer reads through `window.nvoke.local`; `lib/api.ts`
  serves finished searches' companies from it and falls back to it offline.
  The renderer's `lib/types.ts` only re-exports `@nvoke/shared` and the
  contract, and `VITE_MOCK=1` swaps the bridge for an in-memory mock with
  the same shapes (`nvoke.mock.offline=1` in localStorage cuts its network).
- Tests: `pnpm test` starts an embedded Postgres (the `embedded-postgres`
  package, no Docker), builds a template database with every migration and
  gives each database test file its own copy. `TEST_DATABASE_URL` uses an
  existing Postgres instead; CI does that with a `postgres:17` service.

## Web app

nvoke.run/app is the front door: every marketing CTA ("Start free") goes to
`/sign-up` and then `/app`. It does in the browser what the desktop app does
with the API: start every search kind, poll progress every 2 seconds, browse
and filter companies and emails, export the CSV, show usage against the plan
and the upgrade path (`/app/billing`, the same Clerk Billing checkout as
`/desktop/billing`), create or revoke API keys, and make, edit, pause and
delete daily drops and open their runs (`/app/drops`). nvoke Desktop stays the
premium power tools (local render crawl, quick search, grab, CSV drop, local
copy, drop notifications) and is sold from `/download` and the Account page.

- Auth: `proxy.ts` protects `/app` with Clerk (`auth.protect()`, signed out
  goes to `/sign-in`). The browser calls `/v1` on the API directly with the
  Clerk session JWT (`lib/app/api.ts`, a fresh `getToken()` per call), so
  the server needs the site origin in `CORS_ORIGINS` and allows GET, POST,
  PATCH and DELETE.
- Data: `lib/app/api.ts` (fetch client, `ApiError`), `lib/app/queries.tsx`
  (React Query hooks with the desktop's keys and polling),
  `lib/app/drops.ts` (the drop form, a drop's runs and state),
  `lib/app/search-form.ts` (the New search form as data) and
  `lib/app/quota.ts` (usage level, upgrade path, poll intervals). Tests sit
  next to them.
- Reuse: `lib/app/desktop.ts` imports the desktop renderer's pure modules
  (`lib/format.ts`, `lib/countries.ts`, `lib/export-notice.ts`) straight from
  `apps/desktop`, so labels and titles match. Keep those modules free of
  `window.nvoke` and of `@/` imports, or the site build breaks. The shadcn
  primitives in `components/ui` and the small presentational components in
  `components/app` are ported copies of the desktop's.
- Look: `[data-app]` in `globals.css` switches to the desktop type scale
  (13px body), with the same glass, aura and iris accent from
  `packages/theme`. The marketing header and footer stay off `/app`
  (`components/site/site-chrome.tsx`).

## Desktop window

The main window is frameless and has no native controls on any platform
(`src/main/window.ts`, `frame: false`, an opaque chassis). The device frame in
`components/AppShell.tsx` is the way around: ports along the top edge are the
navigation, the name plate and the speaker grille sit below them, the black
display strip shows the running search and opens the command bar, and the
power nub at the top right closes the window (`window.nvoke.window.close()`,
nvoke stays in the tray). The top edge is the drag region (`app-drag`;
buttons, links and fields inside opt out automatically), a double click
there maximizes, the edges resize (docs/desktop/look.md). The renderer reads
`window.nvoke.window.getChrome()` and sets `data-platform`, `data-focused`
and `data-fullscreen` on `<html>` (`lib/chrome.ts`); CSS variants `mac:`,
`blurred:` and `fullscreen:` follow them. The appearance setting is sent to
`nativeTheme.themeSource` so the OS side matches. Size, position and theme
are kept in `userData/window-state.json`.

nvoke lives in the tray (menu bar on macOS, `src/main/tray.ts`): closing the
window only hides it, and the app quits from the tray menu or Cmd+Q. Start at
login is a setting on Account (`src/main/login-item.ts`), on after the first
sign-in, and starts hidden. The tray talks to the renderer through
`window.nvoke.desktop.onCommand`. A global shortcut (`src/main/quick-window.ts`,
changeable on Account) opens the quick window, the command bar over any app, on
`#/quick` of the same renderer. Its Grab from screen row covers the display with an overlay
(`src/main/screen-grab.ts`, `#/grab`), reads the dragged box with the OS text
engine (`src/main/ocr.ts`, no bundled OCR) and lists the companies
(`src/main/grab-extract.ts` drops people) for a domains search. Tray icons are rendered by `pnpm icons` into
`apps/desktop/resources` and unpacked from the asar.

The app updates itself from GitHub Releases (`src/main/updater.ts`,
electron-updater) and shows a What's new card from `apps/desktop/CHANGELOG.md`
on the first start after an update. Releases are cut with `pnpm release`;
details in `docs/desktop/updates.md`.

nvoke also serves MCP to Claude Desktop, Claude Code and Cursor on the
signed-in session (`src/main/mcp`): a local pipe in main, reached through
`mcp-launcher.js`, which clients run with the app binary and
`ELECTRON_RUN_AS_NODE=1`. Tools come from the catalog through `runMcpTool` in
`packages/shared/src/mcp.ts`, the same runner as the server's `POST /mcp`.

`pnpm --filter @nvoke/desktop capture` runs the app on demo data with a
throwaway profile, screenshots every screen in light and dark into
`apps/desktop/screenshots/` (gitignored) and quits. `*.window.png` is the
screen cropped to the window, the only capture that shows the window's
edge, so keep the window uncovered while it runs. The script drops
`ELECTRON_RUN_AS_NODE`, which makes electron.exe start as plain Node and exit
when an Electron based tool exported it.

## Desktop sign-in

The desktop app never runs Clerk. It signs in through the system browser with
a PKCE handoff, like Linear or Slack:

1. Sign in: the main process makes a random `state` and a PKCE verifier, and
   opens `{VITE_SITE_URL}/desktop/sign-in?state=...&code_challenge=...`.
2. The site page (`apps/site/app/desktop`, the only place with Clerk) signs
   the user in, calls `POST /v1/desktop/authorize` with the Clerk session and
   gets a one-time code (5 minutes, single use, stored hashed, bound to the
   user and the challenge). It redirects to
   `nvoke://auth/callback?code=...&state=...`.
3. The OS hands the URL to the app (`open-url` on macOS, `second-instance`
   argv on Windows and Linux). Main checks `state` and calls
   `POST /v1/desktop/token` with the code and verifier.
4. The server returns an opaque device token (`nvk_dt_...`), stored only as a
   sha256 hash in `device_sessions`. Main encrypts it with `safeStorage` in
   userData. The renderer never sees it: it gets `AuthState` (`signed-out`,
   `pending` while the browser is open, `signed-in`) and calls the API through
   `window.nvoke.request`. Sign out calls `POST /v1/desktop/sign-out`.

Code: `apps/desktop/src/main/auth`, `apps/server/src/auth`,
`apps/server/src/api/routes/desktop.ts`. In development the app registers
`nvoke://` for the dev Electron binary (HKCU on Windows); installers register
it through `protocols` in `electron-builder.yml`.

## Hard rules

1. **Theme tokens only in the UI.** Never hardcode palette colors
   (`bg-zinc-900`, `text-gray-500`, `text-white`) or hex values in components.
   Use shadcn tokens: `bg-background`, `bg-card`, `text-muted-foreground`,
   `border-border`, `ring-ring`, `bg-sidebar` and so on. ESLint enforces this in
   `apps/desktop/src/renderer` and `apps/site`. All colors live in
   `packages/theme/theme.css`, so a theme swaps in one file for both apps.
   The desktop's tokens are `packages/theme/field.css`, imported after
   `theme.css`; the site still uses `theme.css` alone.
2. **Theme direction.** An instrument panel in the Braun and Teenage
   Engineering line (docs/desktop/look.md): a warm grey chassis, an off-white
   plate for cards, one signal orange spent on the primary action, running
   progress and the chosen state, keycap buttons that sink when pressed, a
   black display strip with dot matrix figures, tiny mono capital labels,
   channel rows with hairlines and LED dots. Space Grotesk for text (light
   display titles, thin numerals), JetBrains Mono for labels, domains and
   emails, Doto on the screen. Small radii (4 to 8px), no liquid glass; the
   canvas is opaque. Light and dark are two finishes of the same device.
3. **No em dashes, en dashes or `--` as punctuation** in code comments, docs,
   UI strings or commit messages. Rewrite the sentence with a comma, colon,
   parentheses or a full stop. `scripts/check-punctuation.mjs` catches the
   dashes during `pnpm lint`.
4. **Electron security.** `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`. The renderer talks to the main process only through
   `window.nvoke`, typed by `src/ipc/contract.ts`. Every new channel goes in the
   feature's contract module, its preload bridge and a main handler that
   validates its input.
5. **No secrets in the renderer.** Only `VITE_` variables reach it and they are
   baked into the build. Secrets stay in `apps/server/.env`.
6. **Database is Supabase Postgres** over the direct connection or session
   pooler on port 5432. Never the transaction pooler on 6543. Development
   runs against a local Postgres (`cli db`, the CLI and tests use embedded
   Postgres), never the shared Supabase database.
7. **Keep `.env.example` files current** when adding a variable. Never commit
   real values.
