# ANT PancakeSwap DEX Readiness — Execution Register

**Status: PREPARATION ONLY. No mainnet deployment, public sale, pool creation, or liquidity funding is authorized by this document.**

## Issuer-confirmed parameters

- First public-market target: PancakeSwap DEX on BNB Smart Chain.
- Preferred pair for budgeting: ANT/USDT, subject to verification of the official BSC USDT contract and suitability of the pair.
- Token supply: retain the existing ANT contract; do not change its initial supply or token mechanics.
- Liquidity: calculate and compare scenarios only. Current authorized liquidity spend: **0**.
- No mainnet deployment, real-asset transfer, liquidity provision, sale activation, or public fundraising without a separate explicit approval.

## Source-backed token baseline

At the source commit reviewed for this register:

- `contracts/AntColony.sol` defines Ant Colony (ANT), 18 decimals, and `INITIAL_SUPPLY = 200_000 * 10**18`.
- The constructor mints the initial supply once to `initialHolder`.
- The token inherits OpenZeppelin ERC20Burnable. Holders can burn tokens; therefore current `totalSupply()` can be lower than the 200,000 ANT initial mint.
- The token source has no owner, public mint function, pause, blacklist, transfer tax, or privileged transfer control.
- Source facts are not chain evidence. Verify deployed bytecode and on-chain reads after testnet deployment.

## Current evidence and blockers

- ANT source branch: `ant-token-testnet`.
- Branch head at review: `804e37e2ba4a168a6cf4bf049385808dae481d69`.
- Token compile/test CI: [run 45010052384](https://github.com/sutichung/sutichung/actions/runs/45010052384) passed; the security review records 21 Solidity files compiled and 26 tests passed. This is CI evidence only.
- Last known testnet token deployment attempt: [run 44998113877](https://github.com/sutichung/sutichung/actions/runs/44998113877) failed at the deployment step after configuration, install, compile and tests passed. The security review records the deployer had zero tBNB at that time.
- No verified testnet ANT contract address, deployment transaction, source-verification URL, post-deployment totalSupply, or initial-holder balance has been recorded in the reviewed listing roadmap.
- No BSC mainnet ANT contract or PancakeSwap pool is verified.
- The deploy workflow is testnet-only (chainId 97). Its explicit testnet-holder path requires the initial holder to equal the deployer EOA. This is acceptable only as a clearly labelled testnet arrangement; production custody must be separately designed and reviewed.
- The existing tokenomics register says allocations are not verified, circulating supply is not determined, and vesting is not implemented.
- The sale contract's oracle/primary-sale price model is not approved. It must not be confused with the DEX pool price or treated as production-ready.

## Liquidity budget model — no funds committed

For a simple ANT/USDT pool, define:

- (S_0 = 200{,}000) ANT initial supply (source constant, not necessarily current total supply).
- (a) = proposed percentage of initial supply placed into the pool.
- (Q = S_0 \times a / 100) = ANT quantity placed into the pool.
- (P) = approved initial pool ratio in USDT per ANT.
- (U = Q \times P) = USDT quote-side reserve required.
- Approximate initial pool TVL at the deposit ratio: (TVL \approx 2 \times U), before fees, price impact, and market movement.

| Illustrative pool share | ANT side (Q) | USDT reserve (U) | Approx. initial TVL |
|---:|---:|---:|---:|
| 0.5% | 1,000 ANT | 1,000 × P USDT | 2,000 × P USDT |
| 1.0% | 2,000 ANT | 2,000 × P USDT | 4,000 × P USDT |
| 2.0% | 4,000 ANT | 4,000 × P USDT | 8,000 × P USDT |
| 5.0% | 10,000 ANT | 10,000 × P USDT | 20,000 × P USDT |

These are arithmetic scenarios, not approved allocations, a price recommendation, a valuation, or a liquidity commitment. No (P) or (a) has been selected. The actual model must be updated using an issuer-approved, disclosed initial pool ratio and verified available ANT balance. If the actual current total supply is below 200,000 due to burns, use the verified current supply and document the basis.

### Liquidity cost components to estimate before any launch

1. ANT amount reserved for the pool and its source wallet.
2. USDT amount required at the selected pool ratio.
3. BNB gas budget for deployment, approvals, pool creation, and liquidity transactions.
4. Pool fee tier and expected trading-fee economics.
5. Slippage/depth tests for representative trade sizes.
6. LP token custody, lock or time-lock design, unlock disclosures, and recovery policy.
7. Price-impact and volatility scenarios; no guaranteed price or return.
8. Independent confirmation that the quote token is the official BSC USDT contract, including decimals.

## Execution gates

### Gate A — testnet deployment evidence

- Re-check the latest deployment workflow result without accessing or exposing secrets.
- Resolve the known tBNB funding blocker through the user's own testnet wallet/faucet process.
- Confirm the testnet initial-holder address is intentionally the deployer EOA if using the current workflow path.
- Only after separate explicit testnet deployment authorization, deploy on chainId 97.
- Record tx hash, contract address, deployment block, verified source, name, symbol, decimals, totalSupply and initial-holder balance.
- Run the testnet-only tokenomics evidence generator and reconcile all Transfer logs to totalSupply.

### Gate B — tokenomics and custody

- Obtain issuer-approved allocation categories and amounts; do not infer them from a wallet balance.
- Determine whether vesting/locking is required and implement only through separately reviewed contracts if approved.
- Verify treasury/Safe addresses, signer threshold, signer independence and wallet purposes.
- Publish a methodology for circulating supply and holder concentration.

### Gate C — DEX design and security

- Select pool version and fee tier after reviewing PancakeSwap's current BNB Chain options.
- Confirm the official USDT contract address and decimals at execution time.
- Model depth, slippage, volatility, arbitrage and LP withdrawal risks.
- Complete independent review of the token and any launch/vesting/treasury contracts.
- Do not deploy the existing primary-sale contract or use its test oracle as a DEX price source.

### Gate D — legal and public disclosure

- Obtain jurisdiction-specific legal advice for issuer location and target user markets.
- Review token classification, issuance/marketing, VASP obligations, AML/KYC, sanctions, consumer disclosures and tax.
- Publish accurate tokenomics, custody, liquidity, risk and conflict-of-interest disclosures.
- Do not claim exchange approval, audit completion, liquidity lock, or circulating supply without evidence.

### Gate E — mainnet launch approval

This gate remains **BLOCKED** until all preceding gates are evidenced and the issuer separately approves:
- exact mainnet contract bytecode and addresses,
- deployment transaction and gas budget,
- initial ANT/USDT ratio and both reserve amounts,
- LP custody/lock arrangement,
- launch timing and public disclosures.

No action in this register authorizes a mainnet transaction or any liquidity spend.

## Acceptance criteria

- Testnet deployment is independently verifiable by address, transaction, chain ID and post-deployment reads.
- Tokenomics data reconciles to on-chain totalSupply and Transfer history.
- Allocation, circulating supply, vesting and treasury labels are evidence-backed or explicitly marked unknown.
- Liquidity scenarios state their assumptions and sensitivity; committed liquidity spend remains zero.
- Independent security and legal reviews are completed before mainnet.
- Mainnet and pool launch remain blocked until a separate explicit approval.
