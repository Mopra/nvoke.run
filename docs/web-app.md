# Web app (code)

What the web app does is in docs/SPEC.md, "Web app". This is how it is built.

- Auth: `proxy.ts` protects `/app` with Clerk (`auth.protect()`, signed out
  goes to `/sign-in`). The browser calls `/v1` on the API directly with the
  Clerk session JWT (`lib/app/api.ts`, a fresh `getToken()` per call), so
  the server needs the site origin in `CORS_ORIGINS` and allows GET, POST,
  PATCH and DELETE.
- Data: `lib/app/api.ts` (fetch client, `ApiError`), `lib/app/queries.tsx`
  (React Query hooks with the desktop's keys and polling every 2 seconds),
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
  (13px body). The site imports `theme.css` and `field.css` like the desktop
  and overrides the surface tokens in `globals.css`. The marketing header and
  footer stay off `/app`
  (`components/site/site-chrome.tsx`).
