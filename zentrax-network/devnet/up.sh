#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v docker >/dev/null 2>&1 || { echo "Docker is required." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 is required." >&2; exit 1; }
export ZENTRAX_UID="$(id -u)"
export ZENTRAX_GID="$(id -g)"
export ZENTRAX_DEVNET_DATA="${ZENTRAX_DEVNET_DATA:-./.local-data}"
mkdir -p "$ZENTRAX_DEVNET_DATA"
docker compose -f compose.yaml up -d --build
printf '\nZENTRAX local 4-validator reference devnet started.\n'
printf 'CometBFT RPC: http://localhost:26657/status (nodes 1-3: 26667, 26677, 26687)\n'
printf 'EVM JSON-RPC: http://localhost:8545 (nodes 1-3: 8555, 8565, 8575)\n'
printf 'Run ./verify.sh to check all validators and EVM RPC endpoints.\n'
