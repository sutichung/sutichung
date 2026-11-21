#!/usr/bin/env sh
set -eu

DATA_DIR="${ZENTRAX_DEVNET_DATA:-/data}"
CHAIN_ID="zentrax-devnet-1"

if [ ! -s "$DATA_DIR/node0/evmd/config/genesis.json" ]; then
  evmd testnet init-files \
    --validator-count 4 \
    --chain-id "$CHAIN_ID" \
    --output-dir "$DATA_DIR" \
    --node-daemon-home evmd \
    --starting-ip-address 172.30.0.10 \
    --keyring-backend test

  for i in 0 1 2 3; do
    peers=""
    for j in 0 1 2 3; do
      [ "$i" = "$j" ] && continue
      node_id="$(evmd comet show-node-id --home "$DATA_DIR/node$j/evmd")"
      peers="${peers:+$peers,}$node_id@node$j:26656"
    done

    config="$DATA_DIR/node$i/evmd/config/config.toml"
    sed -i "s|^persistent_peers = .*|persistent_peers = \"$peers\"|" "$config"
    # Cosmos EVM requires the CometBFT application mempool.
    sed -i 's/^type = "flood"$/type = "app"/' "$config"
    grep -Fq 'type = "app"' "$config" || {
      echo "Failed to configure app mempool for node $i" >&2
      exit 1
    }
  done
else
  echo "Existing local devnet genesis found; preserving node keys and state."
fi

# This is deliberately outside the fresh-genesis branch: stale local data must
# receive the same required client chain ID without regenerating validator keys.
for i in 0 1 2 3; do
  client_config="$DATA_DIR/node$i/evmd/config/client.toml"
  mkdir -p "$(dirname "$client_config")"

  if [ -f "$client_config" ]; then
    if grep -q '^chain-id[[:space:]]*=' "$client_config"; then
      sed -i 's/^chain-id[[:space:]]*=.*/chain-id = "zentrax-devnet-1"/' "$client_config"
    else
      printf '%s\n' 'chain-id = "zentrax-devnet-1"' >> "$client_config"
    fi
  else
    printf '%s\n' 'chain-id = "zentrax-devnet-1"' > "$client_config"
  fi

  grep -Fq 'chain-id = "zentrax-devnet-1"' "$client_config" || {
    echo "Missing client chain ID for node $i" >&2
    exit 1
  }
done

echo "Initialized four-node local devnet configuration for $CHAIN_ID."
