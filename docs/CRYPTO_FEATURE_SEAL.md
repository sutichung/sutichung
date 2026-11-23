# Crypto market feature seal

Status: **SEALED / NOT AVAILABLE** until explicit readiness approval.

This is a reversible feature seal. The crypto market UI is removed from the Taiwan Stock Hunter navigation and page composition. All `/api/crypto/*` endpoints return HTTP 503 with `status: feature_disabled`; crypto strategy requests and crypto market-intelligence endpoints are also blocked. The embedded realtime feed does not start, the standalone worker exits without connecting to exchanges, and the npm worker script is removed.

Crypto source modules and historical files are retained for a future reviewed reactivation. No crypto market data, trading strategy, wallet, token, or exchange integration is deleted by this seal. ANT BSC Testnet deployment tracking is a separate workflow and remains unchanged.

Reactivation requires explicit owner approval after all of the following are verified: official/licensed data source and redistribution rights; data freshness and outage handling; API and security tests; mobile UI acceptance; cost/resource review; and a separate reviewed PR. Do not enable by changing environment variables alone.
