#!/usr/bin/env bash
# Writes a timestamped dump to ./backups. Phase 4 adds the nightly cron and
# ships the file off the machine, which is the part that actually protects a
# running competition (NFR-3).
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
