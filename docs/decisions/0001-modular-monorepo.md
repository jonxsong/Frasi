# ADR 0001: Modular monorepo

- Status: accepted
- Date: 2026-11-16

## Context

Frasi spans browser audio, symbolic music, APIs, long-running inference, and infrastructure. These
pieces need independent deployability without multiplying repository and release overhead.

## Decision

Use a pnpm workspace for TypeScript packages and colocate Python API, worker, and ML packages in the
same repository. Contracts are versioned at the API boundary. The initial release uses a modular
monolith API and one worker service rather than service-per-stage microservices.

## Consequences

- Cross-cutting changes are reviewable in one commit.
- Frontend and API may deploy independently.
- The worker can later split into CPU and GPU queues without changing the public API.
- CI must run both Node and Python toolchains.
