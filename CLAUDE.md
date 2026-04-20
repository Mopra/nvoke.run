# nvoke.run — agent instructions

The nvoke product. Monorepo (npm workspaces) containing:

- `apps/web/` — frontend, **Vite + React + React Router** + shadcn/ui (NOT Next.js). Auth via Clerk.
- `apps/api/` — backend API, Fastify + TypeScript + Postgres (Supabase) + Clerk.

Deploys to `app.nvoke.run` (web) and `api.nvoke.run` (api) via Coolify.

## Sibling repos

This repo is one of three under the [Mopra/nvoke](https://github.com/Mopra) project. Local sibling paths (when working from the umbrella workspace):

- `../nvoke.run.website/` — the marketing site (`nvoke.run`).
- `../nvoke.run.docs/` — the documentation (`docs.nvoke.run`).

**When to switch repos:**
- If the request is about landing pages, marketing copy, or pricing → switch to `../nvoke.run.website/`.
- If the request is about user-facing documentation, guides, or API reference → switch to `../nvoke.run.docs/`.
- If the request is about product features, dashboards, auth, API endpoints, or user data → stay here.

## Conventions

- **Theme tokens only (hard rule):** use shadcn theme tokens (CSS variables) including sidebar-specific tokens (`--sidebar`, `--sidebar-foreground`, `--sidebar-border`). **No hardcoded palette colors.**
- Theme direction is warm 80°-tinted neutrals with a sage (~150°) ring accent; sidebar is darker than content.
- Empty states use the shared [`<EmptyState>`](apps/web/src/components/EmptyState.tsx) component. Contextual docs links live in the `action` prop and open `https://docs.nvoke.run/<path>` in a **new tab**.
- Cross-property links from the app to docs or marketing always open in a **new tab** (preserves session).
- **Squash-merge PRs (hard rule):** every PR lands as a single squashed commit on `main`. The squash commit message is the public changelog entry — it is scraped live by the marketing site's [changelog page](https://nvoke.run/changelog) via the GitHub commits API, filtered to `feat:` and `fix:` prefixes. Write the final commit message accordingly: conventional-commit prefix (`feat(scope): …` or `fix(scope): …`), one clear sentence, written for end users, not for reviewers. Do not merge or rebase-merge — they leak intermediate WIP commits into the public changelog.
