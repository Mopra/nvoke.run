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
# Postgres 18, role and database nvoke: see "Database"
cp /opt/nvoke/app/deploy/nvoke-*.service /opt/nvoke/app/deploy/nvoke-*.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable nvoke-api nvoke-worker && systemctl enable --now nvoke-backup.timer
/opt/nvoke/app/deploy/deploy.sh
```

## Environment

`/opt/nvoke/.env` holds every variable from `apps/server/.env.example`. Both
units read it. The API needs the first block; the worker reads the second.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | API, worker, migrations | The local Postgres, `postgresql://nvoke:...@127.0.0.1:5432/nvoke` (see "Database") |
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
| `FREE_SEARCH` | worker, API | The free web search (Mwmbl): `fallback` (default; the owner accepted Mwmbl's terms on 2026-10-18) answers when Brave refuses us, is paused or has no key, `first` asks it before Brave, `off` is Brave alone. While Brave is paused the API keeps taking web searches unless this is `off` or the free search is paused too (`free_search` in `source_pauses`) |
| `FREE_SEARCH_INTERVAL_MS` | worker | Milliseconds between two free search requests, default 3000 |
| `BRAVE_MONTHLY_BUDGET_USD` | worker | Brave spend that triggers alert emails at 80% and 100%; match the usage limit in the Brave dashboard |
| `ICP_BRAVE_BUDGET` | worker | Paid Brave requests per run of a Describe your customer search, fresh rounds included, default 120 |
| `ICP_DAILY_BRAVE_BUDGET`, `ONGOING_DAILY_BRAVE_BUDGET` | worker | Paid Brave requests an ongoing search's daily round may make (default 40) and all daily rounds together per UTC day (default 250, about $37 a month at most). Each round reserves its whole budget up front (a query may read 4 result pages), so real spend stays well under the reservation |
| `DAY3_API_KEY` | API, worker | Day3 key (Pradsgaard Labs organization, "nvoke server alerts") for operator alert emails |
| `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` | worker | Who gets alerts, comma separated, and the sender (on a domain verified in Day3) |
| `PRODUCT_HUNT_TOKEN` | worker | Optional; `launches` searches use Show HN only without it |
| `NOMINATIM_URL`, `OVERPASS_URL` | worker | OpenStreetMap endpoints for `local` searches; defaults are public |
| `SMTP_PROBE_ENABLED` | worker | `false` verifies with MX records only |
| `SMTP_HELO_NAME`, `SMTP_PROBE_FROM` | worker | Name and sender used by the RCPT probe (no mail is sent) |
| `SMTP_PROBES_PER_MINUTE` | worker | SMTP sessions a minute over IPv4, default 5. Hostinger cuts outbound IPv4 port 25 off for a long while after bursts above about 5 a minute; IPv6 is not throttled |
| `SMTP_SESSIONS_PER_MINUTE`, `SMTP_SESSIONS_PER_PROVIDER_PER_MINUTE` | worker | SMTP sessions a minute in all (default 60) and to one mail provider: Google, Microsoft 365, else the MX domain (default 20). A session checks a whole domain |
| `SMTP_PREFER_IPV6` | worker | `true` (default) probes over IPv6 when the MX host has an AAAA record, IPv4 otherwise or when IPv6 fails |
| `SMTP_RELAYS` | worker | Other servers to probe through over IPv4, each with its own `SMTP_PROBES_PER_MINUTE`: `host:port=helo name`, comma separated. On the VPS: `127.0.0.1:1081=srv1620345.hstgr.cloud` (see "SMTP relay") |
| `TOOLS_SMTP_PROBES_PER_MINUTE` | API | The free email verifier's share of the session budgets, default 1; the worker gets the rest |
| `OPENROUTER_API_KEY` | API, worker | OpenRouter key (openrouter.ai, API Keys; the "nvoke server" key, $50 a month cap); without it the features that use Claude answer unavailable |
| `AI_MONTHLY_BUDGET_FLOOR_USD`, `AI_MONTHLY_BUDGET_PRICE_SHARE` | API, worker | Claude spend cap per account a month: the share of the plan's price (default 0.25), never below the floor (default 1 USD) |

The verifier's SMTP probe needs outbound port 25. If the VPS provider blocks
it, the worker falls back to MX checks and marks addresses `unknown`; set
`SMTP_PROBE_ENABLED=false` to skip the attempts. `CLI_*` and
`TEST_DATABASE_URL` are for development only and do not belong on the VPS.

### SMTP relay

Hostinger limits outbound port 25 to 5 connections a minute per VPS IPv4
address, on every plan, and will not raise it (support, 2026-10-20). So the
worker also probes through our second VPS, `vps-us-1` (177.7.34.19,
`srv1620345.hstgr.cloud`), which has its own 5 a minute:

- On vps-us-1, the user `nvoke-relay` (no shell) accepts one key, from this
  VPS only, that may forward to port 25 and nothing else
  (`/var/lib/nvoke-relay/.ssh/authorized_keys`:
  `restrict,port-forwarding,permitopen="*:25",from="187.77.85.132,..."`).
- On this VPS, `nvoke-smtp-relay.service` (in this folder, installed by
  hand, `systemctl enable --now`) keeps `ssh -D 127.0.0.1:1081` open as
  `nvoke` with `/opt/nvoke/.ssh/relay_ed25519`.
- `SMTP_RELAYS=127.0.0.1:1081=srv1620345.hstgr.cloud` in `/opt/nvoke/.env`.
  The worker uses this machine's slots first, then the relay's. When the
  tunnel is down, the worker leaves the relay alone for a minute.

A relay at a host without the limit is added the same way: a user, a key,
a tunnel unit on another port and one more entry in `SMTP_RELAYS`.

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

Postgres 18 from the PGDG apt repository, on this VPS, cluster `18/main` on
port 5432, listening on localhost only. Role and database are both `nvoke`;
the password is in `/root/nvoke-pg-password` and in `DATABASE_URL`. Tuning
for this box (4 cores, 15 GB) is in `/etc/postgresql/18/main/conf.d/nvoke.conf`:
`shared_buffers` 2GB, `effective_cache_size` 8GB, `work_mem` 32MB,
`maintenance_work_mem` 512MB, `max_wal_size` 4GB. Until 2026-10-22 the
database was on Supabase (free plan, 500 MB cap); the last dump from there
is `/var/backups/nvoke/supabase-final.dump`.

```bash
sudo -u postgres psql -d nvoke                       # a shell on production
ssh -N -L 55432:127.0.0.1:5432 vps-eu-1              # from a dev machine, for cli ... --prod
```

On a development machine `DATABASE_URL` in `apps/server/.env` points at
`127.0.0.1:55432`, so `--prod` commands work while that tunnel is open and
fail when it is not.

### Backups

`nvoke-backup.timer` runs `deploy/backup-db.sh` every night at 03:30 UTC: a
`pg_dump -Fc` into `/var/backups/nvoke` (7 days kept), checked with
`pg_restore -l` and mirrored with rsync to vps-us-1, where the user
`nvoke-backup` accepts only this box's `/root/.ssh/backup_ed25519` and only
`rrsync` into `/var/lib/nvoke-backup/nvoke`. A failed run emails
`ALERT_EMAIL_TO` through Day3.

```bash
cp deploy/nvoke-backup.service deploy/nvoke-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now nvoke-backup.timer
systemctl start nvoke-backup                          # a backup now
```

Restore (stop `nvoke-api` and `nvoke-worker` first):

```bash
sudo -u postgres dropdb nvoke && sudo -u postgres createdb -O nvoke nvoke
sudo -u postgres pg_restore --no-owner --role=nvoke -d nvoke < /var/backups/nvoke/nvoke-YYYYMMDD-HHMM.dump
```

## Logs

```bash
journalctl -u nvoke-api -f
journalctl -u nvoke-worker -o cat | jq
```
