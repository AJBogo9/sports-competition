#!/usr/bin/env bash
# Restores a dump into the running database, replacing its contents.
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "usage: $0 <dump.sql>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

if [ ! -s "$1" ]; then
  echo "refusing to restore: $1 is missing or empty" >&2
  exit 1
fi

docker compose exec -T db psql -U bot -d bot -v ON_ERROR_STOP=1 --single-transaction < "$1"
echo "restored from $1"
