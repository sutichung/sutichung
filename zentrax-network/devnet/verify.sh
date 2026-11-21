#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "jq is required." >&2; exit 1; }
expected_chain_id=""
expected_height=""
for port in 26657 26667 26677 26687; do
  status="$(curl --fail --silent --show-error "http://127.0.0.1:$port/status")"
  chain_id="$(printf '%s' "$status" | jq -er '.result.node_info.network')"
  height="$(printf '%s' "$status" | jq -er '.result.sync_info.latest_block_height | tonumber')"
  [ "$chain_id" = "zentrax-devnet-1" ] || { echo "Unexpected chain id on RPC port $port: $chain_id" >&2; exit 1; }
  [ "$height" -ge 1 ] || { echo "Node on RPC port $port has not committed a block." >&2; exit 1; }
  if [ -z "$expected_height" ]; then expected_height="$height"; fi
  [ "$height" -eq "$expected_height" ] || { echo "Validator height mismatch on port $port: expected $expected_height, got $height" >&2; exit 1; }
  echo "CometBFT $port: chain=$chain_id height=$height"
done
# A synchronized genesis-height response is not enough: prove that the chain
# continues committing blocks after startup on every validator.
initial_height="$expected_height"
sleep 5
expected_height=""
for port in 26657 26667 26677 26687; do
  status="$(curl --fail --silent --show-error "http://127.0.0.1:$port/status")"
  chain_id="$(printf '%s' "$status" | jq -er '.result.node_info.network')"
  height="$(printf '%s' "$status" | jq -er '.result.sync_info.latest_block_height | tonumber')"
  [ "$chain_id" = "zentrax-devnet-1" ] || { echo "Unexpected chain id after liveness wait on RPC port $port: $chain_id" >&2; exit 1; }
  [ "$height" -gt "$initial_height" ] || { echo "Consensus liveness failure on port $port: height did not advance beyond $initial_height (current $height)." >&2; exit 1; }
  if [ -z "$expected_height" ]; then expected_height="$height"; fi
  [ "$height" -eq "$expected_height" ] || { echo "Validator height mismatch after liveness wait on port $port: expected $expected_height, got $height" >&2; exit 1; }
  echo "CometBFT liveness $port: chain=$chain_id height=$height (started at $initial_height)"
done
validators="$(curl --fail --silent --show-error 'http://127.0.0.1:26657/validators?per_page=100')"
count="$(printf '%s' "$validators" | jq -er '.result.validators | length')"
[ "$count" -eq 4 ] || { echo "Expected 4 validators, found $count" >&2; exit 1; }
for port in 8545 8555 8565 8575; do
  result="$(curl --fail --silent --show-error -H 'content-type: application/json' --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "http://127.0.0.1:$port")"
  chain="$(printf '%s' "$result" | jq -er '.result | strings')"
  case "$chain" in
    0x0|0x00) echo "Invalid zero EVM chain ID on port $port" >&2; exit 1 ;;
  esac
  if [ -z "$expected_chain_id" ]; then expected_chain_id="$chain"; fi
  [ "$chain" = "$expected_chain_id" ] || { echo "EVM chain ID mismatch on port $port: expected $expected_chain_id, got $chain" >&2; exit 1; }
  echo "EVM RPC $port: chainId=$chain"
done
echo "PASS: four validator RPC endpoints, four EVM endpoints, four genesis validators, synchronized block heights, and consistent nonzero EVM chain IDs verified."
