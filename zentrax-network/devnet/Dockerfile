# Reproducible local-only devnet image based on the upstream Cosmos EVM example chain.
# This is a reference devnet harness, not the production ZENTRAX chain binary.
FROM golang:1.26.10-alpine AS build
RUN apk add --no-cache git build-base linux-headers
WORKDIR /src
RUN git clone https://github.com/cosmos/evm.git . && git checkout --detach ba66d3106a52f84b1c1ede8d9683c2df98d742ef
WORKDIR /src/evmd
RUN mkdir -p /out && CGO_ENABLED=1 go build -trimpath -buildvcs=false -ldflags="-s -w" -o /out/evmd ./cmd/evmd

FROM alpine:3.22
RUN apk add --no-cache ca-certificates wget jq libgcc libstdc++
COPY --from=build /out/evmd /usr/local/bin/evmd
ENV HOME=/home/zentrax
RUN addgroup -S zentrax && adduser -S -G zentrax -h /home/zentrax zentrax
USER zentrax
WORKDIR /home/zentrax
EXPOSE 26656 26657 8545 8546 1317 9090
ENTRYPOINT ["evmd"]
