# nvoke

A lead finder: a prospecting research tool. Users find companies and the
contact details they publish on their own websites, in the web app at
nvoke.run/app (nothing to install) or in nvoke Desktop, the native app with
the power tools. The research runs on a Node backend on a VPS.

## Layout

```
apps/
  desktop/   Electron app (electron-vite, React, Tailwind v4, shadcn/ui)
  server/    Fastify API and a separate worker process, Postgres via postgres.js
  site/      Next.js: marketing site and the web app at /app (Vercel, root directory apps/site)
packages/
  shared/    zod schemas and types shared by desktop and server
  theme/     theme.css with the shadcn tokens used by desktop and site
deploy/      systemd units for the API and worker on the VPS
.github/
  workflows/ ci.yml (typecheck, lint, test, build; Postgres service for the
             database tests) and release.yml (installers on tag)
```

## Requirements

Node 24 and pnpm 10 (`corepack enable` picks up the pinned version).

## Getting started

```bash
pnpm install
cp apps/server/.env.example apps/server/.env      # fill in Clerk keys, DATABASE_URL
cp apps/desktop/.env.example apps/desktop/.env    # VITE_API_URL, VITE_SITE_URL
cp apps/site/.env.example apps/site/.env.local     # Clerk keys, NEXT_PUBLIC_API_URL
pnpm migrate        # applies apps/server/migrations to DATABASE_URL
pnpm dev:api        # API on http://localhost:3000, GET /health
pnpm dev:worker     # worker process
pnpm dev:desktop    # Electron app with hot reload
pnpm dev:site       # site on http://localhost:3001
```

The API boots without a database or Clerk keys, so `/health` works on a clean
checkout. Routes behind auth answer 503 until `CLERK_SECRET_KEY` is set.

## The web app

`apps/site` serves the web app at `/app` (Clerk sign-in, then the same `/v1`
API the desktop app uses, called from the browser with the Clerk session
JWT). Run `pnpm dev:api`, `pnpm dev:worker` and `pnpm dev:site`, then open
http://localhost:3001/app. The API must allow the site origin in
`CORS_ORIGINS`. Details in `CLAUDE.md`, "Web app".

## Signing in from the desktop app

Sign in opens the site's `/desktop/sign-in` page in the system browser. After
Clerk sign-in the page hands a one-time code back to the app through
`nvoke://auth/callback`, and the app trades it (with a PKCE verifier) for a
device token that it keeps encrypted on disk. Run the API and the site
alongside the desktop app to try it locally. Details in `CLAUDE.md`.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm lint` | ESLint plus the punctuation check |
| `pnpm test` | Vitest across the workspace |
| `pnpm build` | Builds shared, server (`dist/`), desktop (`out/`) and site (`.next/`) |
| `pnpm migrate` | Applies `apps/server/migrations/*.sql` to `DATABASE_URL` |
| `pnpm dist:desktop` | Builds an installer for the current OS into `apps/desktop/release/` |

## Lead pipeline (apps/server)

The worker runs searches as Postgres jobs (`find`, then `crawl` per company,
then `verify` per email). See `docs/SPEC.md` for the behaviour and
`apps/server/.env.example` for the settings.

- `src/leads`: source adapters (`sources/`), crawler, robots.txt, email
  extraction, verifier (`verify/`), quotas, CSV and the queries behind the API.
- `src/worker`: the job queue (`FOR UPDATE SKIP LOCKED`), handlers and runner.
- `src/api/routes/leads.ts`: the `/v1` routes. The auth preHandler
  (`src/api/auth.ts`, device token or Clerk JWT) sets `request.userId` and
  creates the account; the routes guard with `requireUser` (`src/api/user.ts`).

To run the API, worker, site and desktop app together against a local
database, start one with `pnpm --filter @nvoke/server cli db` (embedded
Postgres in `apps/server/.pgdata`, migrations applied, URL printed), put that
URL in `DATABASE_URL` in `apps/server/.env`, then run `pnpm dev:api`,
`pnpm dev:worker`, `pnpm dev:site` and `pnpm dev:desktop`.

Try a search end to end against a local database (never the shared one):

```bash
pnpm --filter @nvoke/server cli search local "dentists" "Copenhagen" --limit 5
pnpm --filter @nvoke/server cli search launches "email" --days 3 --limit 10 --no-smtp
```

The CLI starts an embedded Postgres with its data in `apps/server/.pgdata`
(the `embedded-postgres` package ships real Postgres binaries, so no Docker
is needed, Windows included) and applies the migrations to it.

Tests do the same in a temp directory: `pnpm test` starts one Postgres, builds
a template database with all migrations, and gives every database test file
its own copy. Set `TEST_DATABASE_URL` to use an existing Postgres instead.

## Deploying

- Server: plain Node under systemd on the VPS, code in `/opt/nvoke`. No Docker.
  See `deploy/README.md`.
- Site: Vercel project with root directory `apps/site`.
- Database: Postgres 18 on the same VPS, localhost only, backed up nightly.
  See "Database" in `deploy/README.md`.

## Releases

Bump `apps/desktop/package.json` version, then push a tag such as `v0.1.0`.
The release workflow builds an NSIS installer (Windows), a dmg (macOS) and an
AppImage (Linux) and attaches them to a GitHub Release. Builds are not code
signed yet.
