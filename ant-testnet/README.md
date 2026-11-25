# ANT / ZENTRAX isolation boundary

## Current status
This directory documents the intended boundary; it does NOT make this branch a standalone repository.
The current Git repository is still `sutichung/sutichung`. A separate GitHub repository and a separately provisioned Render service/database/environment must be created and verified before claiming full isolation.

## Safety boundary
- This branch is testnet/readiness only.
- No private keys, seed phrases, signing, transaction submission, token sale, or mainnet deployment are permitted in CI.
- The status service exposes only status metadata and must not share the Taiwan Stock Hunter database or environment.
- Never copy production secrets or production data into this project.

## CI ownership
- `.github/workflows/zentrax-web.yml` owns frontend/backend build and tests; it must not build the root status-service Dockerfile.
- `.github/workflows/ant-testnet-status-ci.yml` owns the root status-only Docker image and health smoke test.
- `.github/workflows/deploy-ant-testnet.yml` is readiness-only and intentionally performs no deployment.

## Remaining manual provisioning
1. Create a dedicated private GitHub repository for ANT/ZENTRAX and move only reviewed ANT-owned source into it.
2. Provision a separate Render service and, only if persistence is required, a separate database.
3. Configure no shared environment groups or secrets. Do not copy signer material.
4. Verify deployed commit, health endpoint, service identity, and network isolation before retiring any legacy service.
