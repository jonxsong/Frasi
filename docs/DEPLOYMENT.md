# Deployment and operations

## Production topology

Run the Next.js frontend behind an HTTPS edge, the FastAPI service behind a trusted reverse
proxy, one migration-capable API release, one or more Celery workers, PostgreSQL, Redis, and a
private S3-compatible bucket. The local Compose stack uses RustFS so the same S3 contract is
exercised during development.

The `.chatgpt.site` frontend surface cannot host Python workers, PostgreSQL, Redis, or object
storage. Configure `NEXT_PUBLIC_API_URL` at build time to the public HTTPS API origin and include
the frontend origin in `FRASI_CORS_ORIGINS`.

The current public frontend release is available at
[frasi-jazz-studio.perkyaisle4.chatgpt.site](https://frasi-jazz-studio.perkyaisle4.chatgpt.site).
It is an interactive static demonstration until a public API origin and managed dependencies are
provisioned; the complete API/worker/storage path is verified in the local Compose topology.

## Required production secrets

- `FRASI_JWT_SECRET`: at least 32 random characters; rotate with a planned session invalidation.
- `POSTGRES_PASSWORD`: unique database credential.
- `FRASI_S3_ACCESS_KEY` and `FRASI_S3_SECRET_KEY`: least-privilege private-bucket credentials.
- `FRASI_S3_MASTER_KEY`: base64 encoding of exactly 32 random bytes when using RustFS SSE-S3.
- Optional official YouTube and Spotify API credentials.

Example key generation:

```bash
openssl rand -base64 32
```

Do not commit `.env`, keys, access tokens, uploaded audio, database dumps, or benchmark recordings.

## Release procedure

1. Build immutable API, worker, and web images from the same Git commit.
2. Run JS/Python quality gates and the synthetic benchmark.
3. Back up PostgreSQL and verify object-store versioning/retention.
4. Apply `alembic upgrade head` once before admitting writes. The API container does this for the
   single-node Compose workflow; use an explicit migration job in an orchestrator.
5. Roll out the API, then workers, then the frontend.
6. Verify `/api/v1/health/live`, `/api/v1/health/ready`, the web root, a queue heartbeat, and a
   synthetic smoke transcription.
7. Watch 4xx/5xx rates, job failure/retry counts, queue depth, processing latency, database pool
   saturation, storage failures, and free capacity.

## Scaling

API instances are stateless. Scale them behind a load balancer after moving rate limiting and
sessions to shared Redis/PostgreSQL, as implemented. Workers are queue consumers; increase
worker replicas for throughput but keep `--concurrency=1` per CPU-heavy container unless memory
measurements justify more. Route future GPU separation jobs to a distinct queue.

Do not use Redis eviction for the Celery broker/result database. The local service sets
`maxmemory-policy noeviction`.

## Data protection

- PostgreSQL: encrypted volume, point-in-time recovery, daily logical backup, restore drills.
- Object storage: TLS, private bucket policy, SSE-S3/KMS, versioning or retention, lifecycle
  deletion aligned with the privacy policy.
- Redis: private network, authentication/TLS in production, persistence appropriate to the queue
  recovery objective.
- Logs: structured request/job metadata only; do not log tokens, passwords, audio bytes, or
  third-party credentials.

Deletion is intentionally not inferred from this repository’s first release. Before accepting
public users, add and test account/project/audio deletion and publish retention terms.

## Health and incident response

`/health/live` proves the process can answer. `/health/ready` checks PostgreSQL, Redis, and the S3
bucket and should control load-balancer admission. On a failed transcription, preserve its error
code and retry history while keeping the previous score revision usable.

For a compromised signing secret, rotate the secret, revoke persisted refresh sessions, and
force reauthentication. For compromised object credentials, rotate credentials, audit object
access, and re-encrypt if the SSE master key was exposed.
