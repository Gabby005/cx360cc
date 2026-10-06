#!/bin/sh
# Restore a backup:  ./restore.sh backups/cx360-2026-10-06-0200.dump
# This REPLACES everything in the database with the backup. The app is stopped while it runs.
set -eu
cd "$(dirname "$0")"
[ $# -eq 1 ] && [ -f "$1" ] || { echo "Usage: ./restore.sh <backup-file>" >&2; exit 1; }
printf "This replaces the live database with %s. Type YES to continue: " "$1"
read -r ANSWER
[ "$ANSWER" = "YES" ] || { echo "Cancelled."; exit 1; }
docker compose --env-file .env.production stop app scheduler
docker compose --env-file .env.production exec -T db pg_restore -U cx360 -d cx360 --clean --if-exists --no-owner < "$1"
docker compose --env-file .env.production up -d app scheduler
echo "Restored from $1."
