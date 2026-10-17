# Deploying the server

The API and the worker run as plain Node processes under systemd on `vps-eu-1`
(187.77.85.132), the same box as Probe. No Docker, no Coolify.

| What | Where |
|---|---|
| Code (git clone, deploy key) | `/opt/nvoke/app` |
| Secrets, mode 600 | `/opt/nvoke/.env` |
| Node 24 (private to nvoke; the box's `/usr/bin/node` is 22 and used by Probe) | `/opt/nvoke-node/bin` |
| API listen address | `10.0.0.1:43310` (docker bridge) |
| TLS and routing for `api.nvoke.run` | Coolify's Traefik, `/data/coolify/proxy/dynamic/nvoke-api.yaml` |

The repo is private. The `nvoke` user has a read-only deploy key in
`/opt/nvoke/.ssh`, registered on GitHub as "vps-eu-1 nvoke (read-only)".

## Deploy an update

```bash
ssh vps-eu-1 /opt/nvoke/app/deploy/deploy.sh
```

`deploy.sh` pulls, installs, builds, migrates and restarts both units.

## First time setup (already done)

```bash
useradd --system --create-home --home-dir /opt/nvoke --shell /usr/sbin/nologin nvoke
# Node 24 tarball from nodejs.org unpacked into /opt/nvoke-node
sudo -u nvoke ssh-keygen -t ed25519 -N "" -f /opt/nvoke/.ssh/id_ed25519   # add .pub as a deploy key
sudo -u nvoke git clone git@github.com:Mopra/nvoke.run.git /opt/nvoke/app
install -m 600 -o nvoke -g nvoke /dev/null /opt/nvoke/.env                  # then fill it in
cp /opt/nvoke/app/deploy/nvoke-*.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable nvoke-api nvoke-worker
/opt/nvoke/app/deploy/deploy.sh
```

## Environment

`/opt/nvoke/.env` holds every variable from `apps/server/.env.example`. Both
units read it. The API needs the first block; the worker reads the second.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API, worker, migrations | Supabase, port 5432 (see below) |
| `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` | API | Production Clerk instance |
| `CLERK_JWT_KEY`, `CLERK_AUTHORIZED_PARTIES` | API | Optional |
| `CLERK_WEBHOOK_SIGNING_SECRET` | API | Clerk webhook endpoint `https://API_HOST/webhooks/clerk`, events `subscription.*` and `subscriptionItem.*` |
| `SITE_URL`, `PUBLIC_API_URL` | API | `https://nvoke.run` and `https://api.nvoke.run` (the defaults). Used in billing and claim links, MCP OAuth metadata and the OpenAPI server |
| `AGENT_SIGNUP_ENABLED` | API | `false` turns `POST /v1/agents/signup` off (503) |
| `CLAIM_EMAIL_FROM` | API | Sender of the claim email, on a domain verified in Day3; the API reads `DAY3_API_KEY` too |
| `HOST`, `PORT` | API | `10.0.0.1` and `43310` here |
| `CORS_ORIGINS` | API | Defaults to `https://nvoke.run,http://localhost:3001` |
| `WORKER_CONCURRENCY` | worker | Jobs at once, default 16 |
| `BRAVE_SEARCH_API_KEY` | worker | Needed for `web` searches; without it they fail with a clear error |
| `BRAVE_REQUESTS_PER_SECOND` | worker | What the Brave plan allows, default 1 (free plan); 50 here |
| `BRAVE_MONTHLY_BUDGET_USD` | worker | Brave spend that triggers alert emails at 80% and 100%; match the usage limit in the Brave dashboard |
| `DAY3_API_KEY` | API, worker | Day3 key (Pradsgaard Labs organization, "nvoke server alerts") for operator alert emails |
| `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` | worker | Who gets alerts, comma separated, and the sender (on a domain verified in Day3) |
| `PRODUCT_HUNT_TOKEN` | worker | Optional; `launches` searches use Show HN only without it |
| `NOMINATIM_URL`, `OVERPASS_URL` | worker | OpenStreetMap endpoints for `local` searches; defaults are public |
| `SMTP_PROBE_ENABLED` | worker | `false` verifies with MX records only |
| `SMTP_HELO_NAME`, `SMTP_PROBE_FROM` | worker | Name and sender used by the RCPT probe (no mail is sent) |
| `SMTP_PROBES_PER_MINUTE` | worker | SMTP sessions a minute over IPv4, default 5. Hostinger cuts outbound IPv4 port 25 off for a long while after bursts above about 5 a minute; IPv6 is not throttled |
| `SMTP_SESSIONS_PER_MINUTE`, `SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE` | worker | SMTP sessions a minute in all (default 60) and to one mail provider: Google, Microsoft 365, else the MX domain (default 20). A session checks a whole domain |
| `SMTP_PREFER_IPV6` | worker | `true` (default) probes over IPv6 when the MX host has an AAAA record, IPv4 otherwise or when IPv6 fails |
| `TOOLS_SMTP_PROBES_PER_MINUTE` | API | The free email verifier's share of the session budgets, default 1; the worker gets the rest |
| `OPENROUTER_API_KEY` | API, worker | OpenRouter key (openrouter.ai, API Keys; the "nvoke server" key, $50 a month cap); without it the features that use Claude answer unavailable |
| `AI_MONTHLY_BUDGET_FLOOR_USD`, `AI_MONTHLY_BUDGET_PRICE_SHARE` | API, worker | Claude spend cap per account a month: the share of the plan's price (default 0.25), never below the floor (default 1 USD) |

The verifier's SMTP probe needs outbound port 25. If the VPS provider blocks
it, the worker falls back to MX checks and marks addresses `unknown`; set
`SMTP_PROBE_ENABLED=false` to skip the attempts. `CLI_*` and
`TEST_DATABASE_URL` are for development only and do not belong on the VPS.

Migrations run in filename order (`0001_desktop_auth`, `0100_leads`, ...) and
are recorded in `_migrations`. `deploy.sh` applies new ones before restarting.

## Clerk settings for agents

Set once in the production Clerk dashboard. Without them API keys and agent
sign-up still work; MCP OAuth does not.

- **Configure, OAuth applications:** turn on dynamic client registration and
  client ID metadata documents, so MCP clients (Claude, ChatGPT, Cursor) can
  register themselves. The consent screen stays on.
- **Sign-up** must stay open: an MCP client sends a new person through Clerk's
  sign-in, where they sign up.
- **Optional, SSO connections:** enable AgentID if agents should sign in with
  their own identity during OAuth, like Day3 does.
- `/mcp` and `/.well-known/*` are served by the API on `api.nvoke.run`; the
  proxy already sends every path there.

Agent sign-up creates users with the Backend API (`users.createUser` with a
reserved email, `signInTokens.createSignInToken` for the claim link), which
needs nothing switched on.

## Database

Supabase Postgres. Use the direct connection or the session pooler, both on
port 5432. Do not use the transaction pooler on port 6543: it breaks prepared
statements, which postgres.js uses by default.

## Logs

```bash
journalctl -u nvoke-api -f
journalctl -u nvoke-worker -o cat | jq
```
