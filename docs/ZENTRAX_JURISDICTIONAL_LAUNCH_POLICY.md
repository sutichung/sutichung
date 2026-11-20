# ZENTRAX Jurisdictional Launch and Geofencing Policy

Status: launch policy specification. This is not a legal opinion or confirmation that any country is approved.

## Commercial policy

ZENTRAX intends to serve only jurisdictions where the exact product, operating entity, order-matching activity, custody/payment flow, marketing and 5% buyer / 5% seller fee model are lawful and all required licences, registrations, approvals and local operating conditions are satisfied.

No country is approved merely because prediction markets, crypto trading or offshore websites exist there. "Not expressly prohibited" is not sufficient. Legal uncertainty means BLOCKED until written advice from qualified local counsel and any required regulator confirmation/licence is obtained.

## Country-by-country approval record

Each jurisdiction requires a signed approval record containing:
- country and, where relevant, state/province/territory;
- product classification for crypto-price YES/NO contracts;
- whether the product is a derivative, binary option, gambling/betting product, exchange, broker/intermediary or another regulated activity;
- legal entity permitted to operate and serve customers;
- required exchange/operator/intermediary, virtual-asset, payments, custody, gambling and AML registrations/licences;
- whether retail customers may participate and any investor eligibility limits;
- permitted assets, chains, stablecoins, marketing and solicitation restrictions;
- local tax, consumer disclosure, complaints and reporting obligations;
- counsel name, firm, opinion date, scope, assumptions and expiry/review date;
- regulator correspondence/licence identifiers and conditions;
- explicit approval owner and effective date.

Approval is specific to the actual product and operating model. Material changes to contract design, collateral, custody, settlement, customer type, fee model, marketing or legal entity trigger re-review.

## Default geofence state

All jurisdictions start as BLOCKED for real-money functions. Only a jurisdiction with a current APPROVED record may access real-money onboarding, deposits, orders, matching, transfers, redemptions and withdrawals.

Support three states:
- BLOCKED: no real-money account creation, deposits, trading, marketing or withdrawals except legally required customer asset return/support operations.
- REVIEW: no new real-money onboarding, deposits or orders; existing users handled under counsel-approved wind-down/withdrawal process.
- APPROVED: only the exact approved product and customer category are enabled, subject to all licence conditions.

A separate SIMULATION mode may be offered only if it is genuinely non-redeemable, has no cash-equivalent prizes, no crypto deposits, no transferability and no conversion to real assets. Counsel must confirm whether even the simulation can be offered in the jurisdiction.

## Access control

Use layered controls, not IP geolocation alone:
- verified residence and identity/KYC;
- IP and device/location risk signals;
- payment account and wallet jurisdiction signals where lawful;
- sanctions and restricted-person screening;
- customer category and age eligibility;
- ongoing monitoring for VPN/proxy, false residency and circumvention.

If signals conflict or location cannot be reliably established, block real-money actions pending manual review. Do not let a user bypass restrictions by changing language, VPN or wallet network. Re-check jurisdiction at onboarding, login, deposit, order placement, withdrawal and material account changes.

## Market and product scope

The initial product is limited to crypto-price markets (e.g. BTC/USDT, ETH/USDT, BNB/USDT). Approval for one asset, contract, customer type or country does not approve all others. Each market template must be included in the relevant legal approval. Prohibit markets or users restricted by applicable law, sanctions, manipulation/inside-information rules or regulator directions.

## Fees and disclosures

The approved fee schedule is 5% of each execution notional charged to the buyer and 5% charged to the seller. Display both fees and the net debit/credit before order confirmation. Charge only on executed quantity, including partial fills; no charge on unfilled/cancelled quantity. Preserve fee schedule version and fee amounts in immutable execution and ledger records. Local counsel must review whether the fee model creates additional licensing, disclosure, tax or conduct obligations.

## Governance and audit

Maintain an append-only jurisdiction register, legal opinions, licence evidence, geofence rule versions, access decisions, override approvals and incident logs. No engineer, support agent or single administrator may add a country to APPROVED without documented legal sign-off and dual approval from Legal/Compliance and the accountable executive. Emergency compliance block must be available immediately.

Review approvals at least quarterly and whenever laws, regulator guidance, court decisions, product features or business flows change. Automatically expire approvals on their review date unless renewed.

## Initial research flags — not launch approvals

- United States: a CFTC-regulated designated contract market framework exists for certain event contracts. ZENTRAX cannot infer that it may operate nationally; confirm entity, DCM/intermediary status, product eligibility and current litigation/regulatory position with US derivatives counsel.
- Great Britain: official UK materials state that prediction-market operations require Gambling Commission licensing and may be treated as a Betting Intermediary. Block until the correct licence and conditions are satisfied.
- European Union: classification is contract-specific. Some binary event contracts may be financial instruments/derivatives subject to investment-firm authorisation and retail binary-option restrictions; other contracts may fall under each member state's gambling law. No EU-wide blanket approval.
- Australia: ASIC/Moneysmart materials state no prediction market operators are currently licensed as financial markets and warn about binary-option-like characteristics. Block retail real-money access unless a specific lawful authorisation path is confirmed.
- Singapore: unlicensed remote gambling services are unlawful. Block unless local counsel confirms the exact activity and all necessary GRA/other permissions.
- Taiwan: block real-money trading pending Taiwan-qualified legal analysis of derivatives/gambling classification, virtual-asset service, custody, AML, payments and any required permissions.

Research references (verify current versions before relying):
- US CFTC: https://www.cftc.gov/LearnandProtect/PredictionMarkets
- UK Gambling Commission: https://www.gamblingcommission.gov.uk/blog/post/prediction-markets-heres-what-you-need-to-know
- UK operating licences: https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/operating-licences
- ESMA statement: https://www.esma.europa.eu/press-news/esma-news/esma-reminds-firms-existing-rules-and-obligations-under-binary-option-measures
- Australia Moneysmart: https://moneysmart.gov.au/investment-warnings/prediction-markets
- Australia ASIC: https://www.asic.gov.au/about-asic/news-centre/find-a-media-release/2026-releases/26-261mr-asic-statement-prediction-markets
- Singapore GRA: https://www.gra.gov.sg/harm-minimisation/unlawful-remote-gambling-activities

This policy is a release gate, not legal advice. No real-money market may launch until legal approval, required permissions, compliance controls, operational controls and independent security reviews are documented.
