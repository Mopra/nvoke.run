# nvoke

Minimal tool for writing, running, and managing small Node.js functions.

## Dev

1. `cp .env.example .env` and fill in the Supabase `DATABASE_URL` and Clerk keys.
2. `npm install`
3. `npm -w apps/api run migrate`
4. In separate shells: `npm run dev:api` and `npm run dev:web`.

## Stack

- Frontend: React + Vite, Tailwind, shadcn/ui, Monaco, Clerk.
- Backend: Node 20, TypeScript, Fastify, `pg`, Zod, Clerk.
- Database: Postgres (Supabase for dev, Coolify-managed in prod).
- Execution: `child_process.spawn('node', ['runner.mjs', ...])` with a 30s timeout.
