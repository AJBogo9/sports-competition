#!/usr/bin/env bash
# Restores a dump into the running database, replacing its contents.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <dump.sql>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
docker compose exec -T db psql -U bot -d bot -v ON_ERROR_STOP=1 < "$1"
echo "restored from $1"
