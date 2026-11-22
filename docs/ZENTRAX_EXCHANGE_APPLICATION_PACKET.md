# ZENTRAX / ANT — Exchange Application Cover Sheet & Diligence Packet

**Version:** 0.1-draft  
**Public project / creator identity:** ZENTRAX / ZENTRAX Creator  
**Asset:** Ant Colony (ANT)  
**Governance:** Hybrid  
**Status:** Preparation only. No exchange submission or approval is represented by this document.

## A. Applicant identity — do not invent

| Field | Current value | Submission requirement |
|---|---|---|
| Public creator name | ZENTRAX Creator | May be used in public-facing project materials |
| Legal issuer / operator | Not designated | Must be truthfully completed if required by the venue |
| Applicant's legal name and role | Not supplied | Required where the exchange form requests it |
| Authorized business email | Not supplied | Create and verify a project-controlled mailbox |
| Jurisdiction / registration | Not supplied | Provide genuine records if required |
| Beneficial owners / control persons | Not supplied | Confidential KYC/UBO through official secure channel where required |
| Public project website | https://zentrax-ant-testnet.onrender.com | Testnet preview only; not production-ready |
| Source repository | https://github.com/sutichung/sutichung | Public code review reference |
| Mainnet token address | Not deployed | Blocking item |
| Mainnet explorer / verified source | Not available | Blocking item |
| Independent audit | Not completed | Blocking item |
| Legal opinion | Not available | Blocking item where required |

**Pseudonymous-founder disclosure for review:**

> ZENTRAX is a pseudonymously founded digital-asset project. “ZENTRAX Creator” is the public-facing creator identity. The project will provide accurate confidential applicant, control-person, beneficial-owner, and compliance information through the exchange's verified due-diligence process where required. Public pseudonymity does not replace or obstruct required KYC/AML checks.

This wording is not a substitute for naming an accountable applicant. Do not submit until the authorized applicant can truthfully complete the venue's form and attestations.

## B. Technical asset facts — intended, not yet mainnet-verified

- Token name: Ant Colony
- Ticker: ANT
- Intended network: BNB Smart Chain (BEP-20 / EVM)
- Intended initial supply: 200,000 ANT
- Intended decimals: 18
- Intended supply policy: fixed supply / no mint function
- Intended sale fee: 5% of gross USDT purchase amount in the sale contract only; not an exchange-trading tax
- Mainnet token and sale contract: not deployed / not verified
- Testnet contracts: addresses must be re-verified from deployment records before inclusion
- Circulating supply, holder count, market cap, volume and liquidity: not established

All technical values must be checked against final deployment artifacts, source-verified bytecode, and on-chain state before submission.

## C. Common evidence package

### Project and product
- [ ] Final whitepaper, dated and versioned
- [ ] Production website and support contact
- [ ] Roadmap with owners, dependencies and verifiable milestones
- [ ] Product demo and test accounts, with testnet labels
- [ ] User and usage metrics with methodology and reporting period
- [ ] Incident response and business continuity plan

### Token and chain
- [ ] Mainnet token contract address and explorer URL
- [ ] Verified source code, ABI, compiler/build metadata
- [ ] Deployment transaction and deployer/owner disclosures
- [ ] Supply, decimals, allocation, circulating-supply methodology
- [ ] Vesting/lock contracts, unlock dates and wallet addresses
- [ ] Treasury, fee-recipient and liquidity wallet disclosures
- [ ] Official stablecoin contract and decimals, if sale/payment is supported

### Security and operations
- [ ] Independent smart-contract audit and remediation evidence
- [ ] Oracle review, RPC/indexer/reorg test evidence
- [ ] Bug bounty or vulnerability disclosure process
- [ ] Multisig signers, threshold, timelock and recovery procedure
- [ ] Monitoring, incident contacts, operational controls
- [ ] Testnet-to-mainnet release checklist and reproducible test reports

### Legal and compliance
- [ ] Legal issuer/operator and jurisdiction, if required
- [ ] Authorized applicant and proof of authority
- [ ] Confidential KYC/UBO/control-person package, where required
- [ ] Legal opinion for token classification and target markets
- [ ] AML/CFT, sanctions, consumer protection, privacy and tax analysis
- [ ] Geographic restrictions and risk disclosures
- [ ] Conflict-of-interest and creator allocation disclosures

### Market quality
- [ ] Live, verifiable trading venues and pair URLs
- [ ] Genuine liquidity depth, spreads and volume history
- [ ] Market-maker identity and agreement, if any
- [ ] Holder concentration and treasury balances
- [ ] No wash trading, spoofing, artificial volume or paid fake endorsements

## D. Venue submission register

Use only official portals. Record a submission only after the portal confirms receipt and an application reference is saved.

| Venue | Official portal | Status |
|---|---|---|
| Binance | https://www.binance.com/en/support/announcement/detail/d378c2176ac841bb8eae68f63d4c4845 | Not submitted |
| Coinbase | https://www.coinbase.com/listings/apply | Not submitted |
| Kraken | https://www.kraken.com/get-listed | Not submitted |
| OKX | https://www.okx.com/token-listing-apply | Not submitted |
| Bybit | https://www.bybit.com/en/trade/spot/listing-apply | Not submitted |
| Gate | https://www.gate.com/listrequest | Not submitted |
| KuCoin | https://www.kucoin.com/listing?lang=en_US | Not submitted |
| Bitget | https://www.bitget.com/launchhub/application-for-listing | Not submitted |
| Upbit | https://listing.upbit.com/ | Not submitted |
| MEXC | https://www.mexc.com/token-listing-apply | Not submitted |
| Crypto.com | https://crypto.com/listing | Not submitted |
| BitMart | https://bitmart.zendesk.com/hc/en-us/articles/360001865554-Get-Listed-on-BitMart | Not submitted |

## E. Per-venue submission log

For each venue, record:
- venue and product (Spot, Alpha, Futures, App, etc.);
- exact official portal URL;
- submitting authorized person's name and role (stored privately where appropriate);
- date/time and timezone;
- version/hash of submitted documents;
- portal confirmation and application reference;
- follow-up requests and verified official contact;
- review outcome and permitted jurisdictions;
- supported chain, deposits/withdrawals status, trading pair and launch date;
- official listing announcement URL.

## F. Anti-fraud rules

- Do not pay third-party brokers or anyone promising guaranteed listings.
- Verify all follow-up contacts using the exchange's official verification tools.
- Never share seed phrases, private keys, wallet signing access, or cloud credentials with a listing contact.
- Do not fabricate team members, legal entities, partnerships, users, trading volume, audits, liquidity, or market-maker agreements.
- Do not mass-spam exchange employees or submit duplicate applications.
- A submitted application is not an approval; approval is not the same as enabled deposits, withdrawals, or trading.

## G. Current readiness decision

**Current formal submissions: 0.**  
**Current approvals: 0.**  
**Confirmed exchange listings: 0.**

The packet is a structured draft. The mainnet asset, audit, legal applicant/KYC package, verified project contact, production website, and market evidence remain blocking items. The next valid step is to complete the actual issuer/applicant and technical evidence truthfully, then have the authorized applicant review each venue-specific form before submission.


## H. Automated integrity check

The dedicated ANT branch now runs [ANT Listing Readiness Gate](https://github.com/sutichung/sutichung/actions/workflows/ant-listing-readiness.yml) on relevant code/document changes. The checker verifies the testnet-only chain guards, selected token/sale invariants, and truthful zero-submission / zero-approval / no-mainnet disclosures. Latest run: [45011156352](https://github.com/sutichung/sutichung/actions/runs/45011156352) — passed. This is a static integrity check only, not an audit, application submission, deployment or listing approval.
