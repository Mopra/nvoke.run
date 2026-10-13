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

## Database

Supabase Postgres. Use the direct connection or the session pooler, both on
port 5432. Do not use the transaction pooler on port 6543: it breaks prepared
statements, which postgres.js uses by default.

## Logs

```bash
journalctl -u nvoke-api -f
journalctl -u nvoke-worker -o cat | jq
```
