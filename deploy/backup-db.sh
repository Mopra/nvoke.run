#!/usr/bin/env bash
# Nightly dump of the nvoke database: keeps 7 days in /var/backups/nvoke and
# mirrors them to vps-us-1. Run as root by nvoke-backup.timer. On failure it
# emails ALERT_EMAIL_TO through Day3, like the worker's alerts.
set -euo pipefail

DIR=/var/backups/nvoke
KEEP_DAYS=7
REMOTE=nvoke-backup@177.7.34.19

# A subshell, so its set +e does not leak into the script.
alert() (
  set +e
  local env=/opt/nvoke/.env key from to
  key=$(grep '^DAY3_API_KEY=' "$env" | cut -d= -f2- | tr -d '"')
  from=$(grep '^ALERT_EMAIL_FROM=' "$env" | cut -d= -f2- | tr -d '"')
  to=$(grep '^ALERT_EMAIL_TO=' "$env" | cut -d= -f2- | tr -d '"')
  [ -n "$key" ] && [ -n "$from" ] && [ -n "$to" ] || return 0
  jq -n --arg from "$from" --arg to "$to" --arg text "$1" \
    '{from: $from, to: ($to | split(",")), subject: "[nvoke] Database backup failed", text: $text}' |
    curl -sS -m 15 -X POST https://go.day3.app/api/v1/emails \
      -H "authorization: Bearer $key" -H 'content-type: application/json' --data @- >/dev/null
)
trap 'alert "The nightly database backup on vps-eu-1 failed at line $LINENO. See journalctl -u nvoke-backup."; exit 1' ERR

install -d -m 700 "$DIR"
rm -f "$DIR"/*.part
file="$DIR/nvoke-$(date -u +%Y%m%d-%H%M).dump"
sudo -u postgres pg_dump -d nvoke -Fc >"$file.part"
mv "$file.part" "$file"
pg_restore -l "$file" >/dev/null
find "$DIR" -name 'nvoke-*.dump' -mtime +"$KEEP_DAYS" -delete

rsync -a --delete --include='nvoke-*.dump' --exclude='*' \
  -e 'ssh -i /root/.ssh/backup_ed25519 -o BatchMode=yes -o StrictHostKeyChecking=accept-new' \
  "$DIR"/ "$REMOTE":/
echo "backed up $(du -h "$file" | cut -f1) to $file and $REMOTE"
