#!/usr/bin/env bash
# Writes a timestamped dump to ./backups. Phase 4 adds the nightly cron and
# ships the file off the machine, which is the part that actually protects a
# running competition (NFR-3).
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups
out="backups/bot-$(date +%Y%m%d-%H%M%S).sql"

docker compose exec -T db pg_dump -U bot -d bot --clean --if-exists > "$out"
echo "wrote $out"
