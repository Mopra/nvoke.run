# Deploying the server

The API and the worker run as plain Node processes under systemd on the same
VPS as Probe. No Docker, no Coolify. Code lives in `/opt/nvoke`, owned by a
dedicated `nvoke` user.

## First time

```bash
sudo useradd --system --create-home --home-dir /opt/nvoke --shell /usr/sbin/nologin nvoke
sudo -u nvoke git clone <repo-url> /opt/nvoke
cd /opt/nvoke
sudo -u nvoke corepack enable
sudo -u nvoke pnpm install --frozen-lockfile
sudo -u nvoke pnpm --filter @nvoke/shared --filter @nvoke/server build

sudo -u nvoke cp apps/server/.env.example /opt/nvoke/.env
sudo chmod 600 /opt/nvoke/.env           # then fill it in
sudo -u nvoke sh -c 'set -a; . /opt/nvoke/.env; set +a; pnpm migrate'

sudo cp deploy/nvoke-api.service deploy/nvoke-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nvoke-api nvoke-worker
```

Set `HOST=127.0.0.1` in `/opt/nvoke/.env` and put the API behind the reverse
proxy that already terminates TLS on the box.

`pnpm migrate` reads `apps/server/.env` in development. On the VPS the
variables live in `/opt/nvoke/.env`, so the commands above source it first.

## Updating

```bash
cd /opt/nvoke
sudo -u nvoke git pull
sudo -u nvoke pnpm install --frozen-lockfile
sudo -u nvoke pnpm --filter @nvoke/shared --filter @nvoke/server build
sudo -u nvoke sh -c 'set -a; . /opt/nvoke/.env; set +a; pnpm migrate'
sudo systemctl restart nvoke-api nvoke-worker
```

## Database

Supabase Postgres. Use the direct connection or the session pooler, both on
port 5432. Do not use the transaction pooler on port 6543: it breaks prepared
statements, which postgres.js uses by default.

## Logs

```bash
journalctl -u nvoke-api -f
journalctl -u nvoke-worker -o cat | jq
```
