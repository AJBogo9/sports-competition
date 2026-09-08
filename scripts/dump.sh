#!/usr/bin/env bash
# Writes a timestamped dump to ./backups, for moving a self-hosted instance by
# hand. It is not the backup NFR-3 requires: that is met by hosting the database
# on Tietokilta's PostgreSQL server, whose nightly dumps leave the machine.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/bot-$(date +%Y%m%d-%H%M%S).sql"
tmp="$out.tmp"
trap 'rm -f "$tmp"' EXIT

docker compose exec -T db pg_dump -U bot -d bot --clean --if-exists > "$tmp"

if [ ! -s "$tmp" ]; then
  echo "dump produced an empty file, not keeping it as $out" >&2
  exit 1
fi

mv "$tmp" "$out"
echo "wrote $out"
