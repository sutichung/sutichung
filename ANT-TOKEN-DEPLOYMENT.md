# Ant Colony (ANT) — BSC testnet deployment

## Approved token specification
- Name: Ant Colony
- Symbol: ANT
- Network: BNB Smart Chain (BSC)
- Testnet chain ID: 97
- Decimals: 18
- Initial supply: 200,000 ANT
- Burn: holder burn and allowance-based burnFrom
- Minting: none
- Owner/admin: none
- Initial supply recipient: multisig/Safe address

## Security model
The constructor requires a non-zero initial holder and mints the entire fixed supply directly to that address. The token has no owner, mint function, pause, blacklist, tax, or privileged transfer controls. A multisig controls custody of the initial supply; it does not control token logic.

## Test and compile
Node.js 20 is recommended.
```sh
npm install
npm run compile:token
npm run test:token
```

## Testnet deployment prerequisites
1. Create and verify a BSC Testnet Safe/multisig (recommended threshold 2-of-3).
2. Confirm the Safe address on chain ID 97 and ensure its signers can access it.
3. Fund a separate deployer EOA with testnet tBNB for gas. The deployer key must never be the treasury key.
4. Configure secrets locally; never commit a .env file:
```sh
DEPLOYER_PRIVATE_KEY=0x...
ANT_MULTISIG_ADDRESS=0x...
BSC_TESTNET_RPC_URL=https://bsc-testnet-dataseed.bnbchain.org
```
5. Deploy:
```sh
npm run deploy:token:testnet
```
6. Save the contract address and deployment transaction, verify the source on BscScan, and independently confirm totalSupply and Safe balance are both 200,000 * 10^18.

## Important
No deployment is considered complete until an on-chain transaction hash, contract address, verified source, and post-deployment balance checks are recorded. Never share a seed phrase or private key in chat or GitHub. A testnet deployment has no mainnet value and is not a Binance exchange listing.
