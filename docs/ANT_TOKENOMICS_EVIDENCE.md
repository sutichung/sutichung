# ANT Tokenomics & Supply Evidence Register

**Status: engineering baseline only. Allocation, circulating supply and vesting are not approved or verified.**

This register deliberately separates facts observable in source code from issuer decisions and chain evidence.

## 1. Facts verified in current source

| Item | Source-backed fact | Limitation |
|---|---|---|
| Token name / ticker | Ant Colony / ANT | Ticker collision and trademark clearance not completed |
| Decimals | 18 | Must also be checked against deployed bytecode |
| Initial mint | 200,000 ANT | Constructor mints the entire initial supply to one `initialHolder` address |
| Mint authority | No public mint function or owner role in current token contract | Confirm exact deployed bytecode before production |
| Burn | ERC-20 holders may burn their own tokens; approved spenders may burnFrom | Total supply may decrease; 200,000 is initial supply, not guaranteed current supply |
| Transfer tax / pause / blacklist | None present in current token source | Verify deployed bytecode and all inherited behavior |
| Vesting contract | No vesting contract is present in the current top-level production contract set | This is not proof that no off-chain lock, custody restriction or external lock exists |

## 2. Allocation and unlock status

No allocation percentages are assigned by this document. The source contract mints 100% of the initial supply to the constructor's `initialHolder`; subsequent allocation depends on transfers and must be supported by transaction evidence and issuer-approved wallet labels.

| Allocation category | Amount / percentage | Beneficiary / wallet | Vesting / unlock |
|---|---|---|---|
| Initial holder | 200,000 ANT at constructor mint | Deployment argument; actual address requires deployment evidence | No vesting implemented in current contract source |
| Team / founders | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Advisors | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Community / rewards | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Treasury / reserve | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Liquidity | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |
| Public / private sale | NOT PROVIDED | NOT PROVIDED | NOT PROVIDED |

The initial holder is not automatically the beneficial owner or final allocation category. Do not infer team, treasury, liquidity or public-sale allocations from a wallet balance.

## 3. Supply terminology

- **Initial supply:** 200,000 ANT minted once by the current constructor.
- **Current total supply:** on-chain `totalSupply()`; may be lower after burns.
- **Holder balance:** reconstructed from ERC-20 Transfer events; an address is not necessarily one beneficial owner.
- **Circulating supply:** NOT DETERMINED. Requires issuer-approved exclusions and wallet labels (e.g. treasury, vesting, locked liquidity), plus a published methodology.
- **Fully diluted valuation:** do not calculate or publish until a defensible reference price exists; fixed initial supply alone does not establish market value.
- **Allocation:** NOT VERIFIED. Requires issuer-approved schedule and wallet-level evidence.
- **Vesting:** NOT IMPLEMENTED in the current production contract set; a separate reviewed vesting contract and beneficiary schedule would be required if vesting is adopted.

## 4. Reproducible BSC Testnet balance evidence

Script: `scripts/generate-ant-tokenomics-evidence.mjs`

Required environment:
- `ANT_TOKEN_ADDRESS`: deployed ANT contract address on BSC Testnet.
- `ANT_DEPLOYMENT_BLOCK`: deployment block number.
- Optional `BSC_TESTNET_RPC_URL`: BSC Testnet RPC endpoint.
- Optional `ANT_LOG_BLOCK_RANGE`: RPC log-query window (default 2,000 blocks; maximum 10,000).

Run:
```bash
node scripts/generate-ant-tokenomics-evidence.mjs
```

The script:
1. Refuses any network other than BSC Testnet chain ID 97.
2. Verifies contract bytecode and token metadata.
3. Reads every Transfer log from the supplied deployment block through the current chain tip in bounded ranges.
4. Reconstructs non-zero holder balances and reconciles their sum against on-chain totalSupply.
5. Reports the largest 20 balances and cumulative burns.
6. Explicitly leaves allocation, legal circulating supply and beneficial ownership unverified.

Output: `artifacts/ant-tokenomics-evidence.json`.

If no verified testnet deployment address and deployment block exist, the script cannot produce live evidence. Do not substitute a mock or invented address.

## 5. Issuer decisions still required

- [ ] Approve final allocation categories, amounts and percentages; total must reconcile to initial supply.
- [ ] Identify each allocation wallet and beneficial owner where disclosure is required.
- [ ] Decide whether team/advisor/community/treasury/liquidity allocations need vesting.
- [ ] If vesting is used, specify cliff, start, duration, frequency, revocability, beneficiary changes and emergency treatment.
- [ ] Implement and independently review vesting/lock contracts before funding them.
- [ ] Define circulating-supply methodology and exclusions consistently with target market-data providers.
- [ ] Approve treasury wallet and multisig signer policy.
- [ ] Reconcile sale allocations, unsold inventory, burns, treasury balances and locked balances.
- [ ] Publish a dated tokenomics disclosure and update it after material changes.

## 6. Release restrictions

This document is not a whitepaper, offer document, legal opinion, audit, proof of beneficial ownership or approval of token distribution. Do not market the token as fully distributed, vested, deflationary, circulating, audited or exchange-listed without separate evidence. No public sale or mainnet launch is authorized by this register.
