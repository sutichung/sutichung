#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
docker compose -f compose.yaml down
echo "Devnet stopped. Local validator keys and data remain in .local-data."
