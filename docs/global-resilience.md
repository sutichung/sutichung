# Global multi-region availability and live operations

## Current state and safety boundary

The active production service remains the existing Render service in Oregon. The active `render.yaml` is intentionally unchanged. This example does not create resources or incur charges. Do not claim global failover until each region is deployed, health-checked, traffic-routed, and exercised with a failover test.

Render currently offers Oregon, Ohio, Virginia, Frankfurt, and Singapore regions. Each region has a separate private network; cross-region service traffic must use authenticated public networking or a supported external data plane. See [Render regions](https://render.com/docs/regions).

## Target topology

- Global DNS / edge: Cloudflare DNS and Load Balancing, with one origin per region, HTTPS-only origin connections, health monitors, failover pools, and alerting.
- Application: Singapore (Asia-Pacific), Oregon (Americas), Frankfurt (Europe). Each regional web service runs at least two instances on a paid plan. Keep app instances stateless.
- Health: use `/api/health/live` for process liveness and `/api/health/ready` for traffic readiness. `/api/health` remains backward compatible and includes deployment metadata. A configured target instance count is informational only; it is not proof that instances exist.
- Data: Supabase remains the system of record. Keep all writes on the primary. Add read replicas only for eligible read-heavy workloads and route read-only queries to them; asynchronous replication can lag and replicas are not writable. Auth operations continue to use the primary. See [Supabase read replicas](https://supabase.com/docs/guides/platform/read-replicas).
- Recovery: enable an appropriate Supabase backup/PITR plan, export critical records off-site, document restore ownership, and test restoration. Backups and PITR have plan-dependent costs and restore operations can cause downtime. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).
- Shared state: move in-memory cache, rate-limit counters, scheduled-job locks, and work coordination to shared managed infrastructure before scaling horizontally. Use idempotency keys, bounded retries, exponential backoff, circuit breakers, and a dead-letter queue. Never let every regional instance run the same singleton scheduler.
- Market data: ingest once per provider/market where licensing permits, publish timestamped events to regional consumers, retain source, exchange timestamp, receive timestamp, freshness and sequence/continuity metadata. Mark stale or disconnected data explicitly; never silently substitute stale prices as live.
- Observability: external probes from multiple regions; collect request latency, error rate, instance heartbeat, CPU/memory, provider latency, quote age, queue lag, replication lag, deploy SHA, and failover events. Alert on missed heartbeat, stale market data, rising 5xx, exhausted queue, and replication lag.

## Deployment template

`render-global.blueprint.example.yaml` is a paid, three-region example and is deliberately not referenced by the active `render.yaml`. It provisions six web instances (two per region) if applied. Review the Render plan and monthly estimate before any apply. Configure Cloudflare origin pools using the deployed regional service URLs; use /api/health/ready as the monitor path. Do not place secrets in Git: enter them in the Render dashboard as secret environment variables.

Render supports manual multi-instance scaling on paid plans; autoscaling requires Pro or higher. Health checks remove unhealthy instances from traffic and restart instances after sustained failure, but health checks alone do not create cross-region routing. See [Render scaling](https://render.com/docs/scaling), [health checks](https://render.com/docs/health-checks), and [Blueprint reference](https://render.com/docs/blueprint-spec).

## Failover and acceptance runbook

1. Deploy the same immutable Git SHA to all three regions and verify each region's /api/health reports the expected region and SHA.
2. Verify two or more healthy instances per region in the Render dashboard; do not infer this from EXPECTED_INSTANCE_COUNT.
3. Configure Cloudflare origin health checks and failover pool; test from Taiwan, North America, and Europe.
4. Simulate one instance failure, then a full regional-origin failure in a maintenance window. Verify traffic moves to healthy origins and recovery is automatic.
5. Confirm user login, admin account recovery, quote freshness, market data source provenance, and read/write consistency after failover.
6. Test database backup restore and document RPO/RTO. Read replicas are read-only and asynchronous; never promote one or send writes to it without a documented database failover procedure.
7. Record observed failover time, data loss window, stale quote behavior, and rollback steps. Repeat after infrastructure changes.

## Operational targets (initial SLO proposal)

- Monthly application availability target: 99.9%, measured externally; this is a target, not a current guarantee.
- API p95 latency: under 800 ms for cached read endpoints under normal load.
- Market-data freshness: show provider timestamp and age; alert thresholds are market/provider specific.
- RPO/RTO: set per data class after backup and restore tests; do not promise zero data loss or zero downtime before measurement.
- Incident alert: page/notify on regional outage, primary database unavailability, stale critical quotes, or failed deployment smoke tests.

## Current implementation status

- Added runtime liveness/readiness endpoints and region/instance metadata in the application.
- Added unit tests for health metadata and for explicitly unknown topology.
- Added an example paid three-region Render Blueprint, not active and not deployed.
- Not yet configured: Cloudflare Load Balancing origins/health monitors, paid regional Render services, shared cache/queue, Supabase replica/PITR, off-site backups, external alert routing, and game-day failover tests.
- Existing per-process in-memory caches, pending-request map, and firewall telemetry are not shared across instances. Horizontal scaling must not be considered production-safe for singleton jobs or globally consistent rate limiting until these are moved to shared state.
