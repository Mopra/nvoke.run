# nvoke

Lead finder. Electron desktop app plus a Node backend (API and worker) on a VPS.
pnpm workspaces, TypeScript everywhere, Node 24.

## Layout

- `apps/desktop`: Electron via electron-vite. `src/main` (main process),
  `src/preload` (bridge), `src/ipc/contract.ts` (typed IPC contract),
  `src/renderer` (React, Tailwind v4, shadcn/ui). Packaging in
  `electron-builder.yml` (nsis, dmg, AppImage, unsigned).
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
- `apps/site`: Next.js (App Router) marketing and download site. Deploys to
  Vercel with root directory `apps/site`. Placeholder pages, plus the desktop
  sign-in page under `app/desktop` (Clerk is scoped there by `proxy.ts`).
- `packages/theme`: `theme.css`, the single source of the shadcn color tokens
  (plus a few extras: `sidebar-material`, `glow`, `sheen`, `scrim`, layered
  shadows). Imported by the desktop renderer's `index.css` and the site's
  `globals.css`.
- `deploy/`: systemd units (`nvoke-api.service`, `nvoke-worker.service`) and
  the VPS runbook. Server runs as plain Node in `/opt/nvoke` under a dedicated
  `nvoke` user, with secrets in `/opt/nvoke/.env`. No Docker, no Coolify.
- `packages/shared`: zod schemas for every request and response between desktop
  and server. Change the schema here first, then both sides.

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
  request authenticated (`via`), and `plan`, `usage` and `maxSearchLimit`
  from `accountSummary()`.
- Pricing: one plan for everyone, priced by verified emails a month. The
  ladder is `packages/shared/src/plans.ts`; each paid key is a Clerk Billing
  user plan slug. Checkout is on the site (`app/desktop/billing`); the server
  reads the held plan from Clerk (`src/billing/clerk.ts`) and charges a
  verified email in the verify job (`chargeVerified` in `src/leads/quota.ts`).
  Change a price or allowance in `plans.ts` and in the Clerk dashboard
  together. Details in `docs/SPEC.md`, "Plans".
- Desktop data flow: the renderer calls `window.nvoke.request(method, path,
  body)` (paths under `/v1/` only) and `window.nvoke.exportCsv(searchId,
  name)`. Main answers both through `AuthSession.api`, which attaches the
  device token and flips to signed out on 401 (`src/main/api-bridge.ts`).
  `request` never rejects: `{ ok, status, data }` or `{ ok: false, status,
  error }`. The renderer's `lib/types.ts` only re-exports `@nvoke/shared` and
  the contract, and `VITE_MOCK=1` swaps the bridge for an in-memory mock
  with the same shapes.
- Tests: `pnpm test` starts an embedded Postgres (the `embedded-postgres`
  package, no Docker), builds a template database with every migration and
  gives each database test file its own copy. `TEST_DATABASE_URL` uses an
  existing Postgres instead; CI does that with a `postgres:17` service.

## Desktop window

The main window is frameless with native controls (`src/main/window.ts`).
macOS: `hiddenInset` traffic lights at the top left of the canvas, `sidebar`
vibrancy. Windows: hidden title bar with `titleBarOverlay` caption buttons (clear
over Mica), Mica on Windows 11 (build 22000+), opaque on Windows 10. Linux: the same
overlay, opaque. There is no sidebar: a floating glass island at the top center opens the
command bar and shows a running search's progress (`components/AppShell.tsx`).
The renderer reads `window.nvoke.window.getChrome()` and sets
`data-platform`, `data-material` and `data-controls` on `<html>`
(`lib/chrome.ts`); CSS variants `mac:`, `material:`, `blurred:` and
`fullscreen:` follow them. Drag regions use the `app-drag` utility; buttons,
links and fields inside opt out automatically. The appearance setting is sent
to `nativeTheme.themeSource` so the material matches, and the caption button
colors follow `--background` and `--foreground`. Size, position and theme are
kept in `userData/window-state.json`.

nvoke lives in the tray (menu bar on macOS, `src/main/tray.ts`): closing the
window only hides it, and the app quits from the tray menu or Cmd+Q. Start at
login is a setting on Account (`src/main/login-item.ts`), on after the first
sign-in, and starts hidden. The tray talks to the renderer through
`window.nvoke.desktop.onCommand`. Tray icons are rendered by `pnpm icons` into
`apps/desktop/resources` and unpacked from the asar.

`pnpm --filter @nvoke/desktop capture` runs the app on demo data with a
throwaway profile, screenshots every screen in light and dark into
`apps/desktop/screenshots/` (gitignored) and quits. `*.window.png` is the
screen cropped to the window, the only capture that shows the material and
caption buttons, so keep the window uncovered while it runs. The script drops
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
2. **Theme direction.** How Apple would design a native app in 2030: calm,
   extreme whitespace, premium. Cool near-neutral grays (oklch hue about 265,
   chroma under 0.01) and one accent, "iris" (oklch about 0.57 0.215 268),
   spent sparingly: the primary action (with a soft glow), focus, running
   progress, and the aura (ambient iris light that rises only while a search
   runs). Large display type (`font-display`, `text-3xl` to `text-5xl`), thin
   numerals for figures, pills and large continuous radii (20 to 28px),
   floating liquid glass (`glass`, `glass-strong`) for controls, no boxes
   around content. System fonts, monospace for domains and emails. The desktop
   window is one translucent canvas (`canvas`) over the window material
   (vibrancy on macOS, Mica on Windows 11), opaque where there is none.
3. **No em dashes, en dashes or `--` as punctuation** in code comments, docs,
   UI strings or commit messages. Rewrite the sentence with a comma, colon,
   parentheses or a full stop. `scripts/check-punctuation.mjs` catches the
   dashes during `pnpm lint`.
4. **Electron security.** `contextIsolation: true`, `nodeIntegration: false`,
   `sandbox: true`. The renderer talks to the main process only through
   `window.nvoke`, typed by `src/ipc/contract.ts`. Every new channel goes in the
   contract, the preload and a main handler that validates its input.
5. **No secrets in the renderer.** Only `VITE_` variables reach it and they are
   baked into the build. Secrets stay in `apps/server/.env`.
6. **Database is Supabase Postgres** over the direct connection or session
   pooler on port 5432. Never the transaction pooler on 6543. Development
   runs against a local Postgres (`cli db`, the CLI and tests use embedded
   Postgres), never the shared Supabase database.
7. **Keep `.env.example` files current** when adding a variable. Never commit
   real values.
