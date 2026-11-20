# ZENTRAX — ANT token / BSC testnet deployment

## Token specification
- Brand: ZENTRAX (black and metallic gold)
- Token name: Ant Colony
- Symbol: ANT
- Network: BNB Smart Chain (BSC)
- Testnet chain ID: 97
- Decimals: 18
- Fixed initial supply: 200,000 ANT
- Burn: holder burn and allowance-based burnFrom
- Minting after deployment: none
- Token owner/admin: none
- Initial supply recipient: creator-controlled multisig/Safe address

## Creator control and holder protection
The constructor mints the entire fixed supply to the configured initial holder. To give the creator the largest initial economic position, configure the creator-controlled Safe as that initial holder and verify its balance after deployment. The creator may control the treasury and platform administration through separately permissioned, auditable systems; the ANT token itself intentionally has no owner key or privileged transfer controls.

Recommended custody is a creator-controlled 2-of-3 Safe with independently secured signers. The creator should retain a signing role and control the treasury policy, while recovery signers reduce single-key loss risk. Do not publish or imply that a Safe is controlled by one person if its threshold requires other signers.

The platform may monitor large transfers, wallet concentration, liquidity changes, and unusual sell pressure, then publish alerts and risk notices. It must not attack traders, manipulate prices, secretly blacklist holders, seize tokens, or selectively block sells. Any future circuit breaker or transfer restriction would require public rules, legal review, independent security review, and a separately approved contract design; none exists in the current token.

## Security model
The constructor requires a non-zero initial holder and mints the entire fixed supply directly to that address. The token has no owner, mint function, pause, blacklist, tax, or privileged transfer controls. A multisig controls custody of the initial supply; it does not control token logic. This protects holders from arbitrary administrator confiscation or hidden transfer restrictions.

## Test and compile
Node.js 20 is recommended.
```sh
npm install
npm run compile:token
npm run test:token
```

## Testnet deployment prerequisites
1. Create and verify a BSC Testnet Safe/multisig (recommended threshold 2-of-3), controlled by the creator and trusted recovery signers.
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

## Release gates
- A testnet deployment is a preview only and has no mainnet value.
- Before a public sale, independently review the sale contract and oracle, validate price freshness and manipulation resistance, verify treasury addresses, complete legal review, and publish supply, allocation, unlock, fee, and liquidity disclosures.
- Do not promise a listing on Binance or any exchange. Exchange listing is a separate review and approval process.
- No deployment is considered complete until an on-chain transaction hash, contract address, verified source, and post-deployment balance checks are recorded.
- Never share a seed phrase or private key in chat or GitHub.
