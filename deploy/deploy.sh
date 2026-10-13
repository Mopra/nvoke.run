#!/usr/bin/env bash
# Pull, build, migrate and restart nvoke on the VPS. Run as root.
set -euo pipefail

APP=/opt/nvoke/app
export PATH=/opt/nvoke-node/bin:$PATH
as_nvoke() { sudo -u nvoke env PATH="$PATH" HOME=/opt/nvoke "$@"; }

cd "$APP"
as_nvoke git pull --ff-only
as_nvoke corepack pnpm install --frozen-lockfile
as_nvoke corepack pnpm --filter @nvoke/shared --filter @nvoke/server build
as_nvoke bash -c 'set -a; . /opt/nvoke/.env; set +a; corepack pnpm migrate'

cp "$APP"/deploy/nvoke-api.service "$APP"/deploy/nvoke-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl restart nvoke-api nvoke-worker
sleep 2
systemctl --no-pager --lines=0 status nvoke-api nvoke-worker
