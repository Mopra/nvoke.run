# Desktop sign-in

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

## Data flow after sign-in

The renderer calls `window.nvoke.request(method, path, body)` (paths under
`/v1/` only) and `window.nvoke.exportCsv(searchId, name)`. Main answers both
through `AuthSession.api`, which attaches the device token and flips to signed
out on 401 (`src/main/api-bridge.ts`). `request` never rejects: `{ ok, status,
data }` or `{ ok: false, status, error }`. Main also keeps a local copy of
searches and companies in SQLite (`src/main/local`: `node:sqlite`, synced in
the background, wiped on sign out) that the renderer reads through
`window.nvoke.local`; `lib/api.ts` serves finished searches' companies from it
and falls back to it offline (docs/desktop/local-copy.md). The renderer's
`lib/types.ts` only re-exports `@nvoke/shared` and the contract, and
`VITE_MOCK=1` swaps the bridge for an in-memory mock with the same shapes
(`nvoke.mock.offline=1` in localStorage cuts its network).
