# nvoke

Lead finder. Electron desktop app plus a Node backend (API and worker) on a VPS.
pnpm workspaces, TypeScript everywhere, Node 24.

## Layout

- `apps/desktop`: Electron via electron-vite. `src/main` (main process),
  `src/preload` (bridge), `src/ipc/contract.ts` (typed IPC contract),
  `src/renderer` (React, Tailwind v4, shadcn/ui). Packaging in
  `electron-builder.yml` (nsis, dmg, AppImage, unsigned).
- `apps/server`: `src/api` (Fastify, entry `src/api/index.ts`), `src/worker`
  (separate process, entry `src/worker/index.ts`), `src/db` (postgres.js client
  and migration runner), `migrations/` (numbered `.sql` files, applied in order).
- `apps/site`: Next.js (App Router) marketing and download site. Deploys to
  Vercel with root directory `apps/site`. Placeholder pages only.
- `packages/theme`: `theme.css`, the single source of the shadcn color tokens.
  Imported by the desktop renderer's `index.css` and the site's `globals.css`.
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
pnpm dev:site         # next dev on port 3001
pnpm migrate          # needs DATABASE_URL
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
- Auth: the desktop app signs in with Clerk (`@clerk/react`) and sends the
  session token as `Authorization: Bearer`. The server verifies it with
  `@clerk/backend` in `src/api/auth.ts`. Protect a route with
  `{ preHandler: app.requireAuth }` and read `req.auth`.
- Open item: Clerk in a packaged Electron app (renderer loaded from `file://`)
  needs a decision, for example a custom protocol or an external browser
  sign-in flow. Dev mode works on the Vite dev server origin.

## Hard rules

1. **Theme tokens only in the UI.** Never hardcode palette colors
   (`bg-zinc-900`, `text-gray-500`, `text-white`) or hex values in components.
   Use shadcn tokens: `bg-background`, `bg-card`, `text-muted-foreground`,
   `border-border`, `ring-ring`, `bg-sidebar` and so on. ESLint enforces this in
   `apps/desktop/src/renderer` and `apps/site`. All colors live in
   `packages/theme/theme.css`, so a theme swaps in one file for both apps.
2. **Theme direction.** Warm neutrals at oklch hue about 80 with low chroma,
   a sage accent ring at hue about 150, and a sidebar darker than the content in
   both light and dark mode (card, then background, then sidebar in lightness).
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
   pooler on port 5432. Never the transaction pooler on 6543.
7. **Keep `.env.example` files current** when adding a variable. Never commit
   real values.
