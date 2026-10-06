#!/bin/sh
# Daily database backup. Run from the deploy/ folder (cron example in docs/IT-REHEARSAL-GUIDE.md).
# Keeps the last 14 days. Copy the "backups" folder to a different machine as well — a backup on the same server is not enough.
set -eu
cd "$(dirname "$0")"
mkdir -p backups
FILE="backups/cx360-$(date +%Y-%m-%d-%H%M).dump"
docker compose --env-file .env.production exec -T db pg_dump -U cx360 -Fc cx360 > "$FILE"
[ -s "$FILE" ] || { echo "Backup is empty — something is wrong" >&2; rm -f "$FILE"; exit 1; }
find backups -name 'cx360-*.dump' -mtime +14 -delete
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
