# Contributing to Frasi

Thank you for improving Frasi. Keep changes focused, preserve the concert-pitch and dual-timing
invariants, and never add audio without clear redistribution rights.

## Workflow

1. Create a branch from `main` and describe the behavior being changed.
2. Add or update tests at the closest layer: music-core, web, API, DSP, or browser E2E.
3. Run the commands in the README quality-gates section.
4. Update architecture, benchmark, deployment, or status documentation when behavior changes.
5. Open a pull request with risk, verification, migration, and rollback notes.

API changes should remain under `/api/v1` unless intentionally versioned. Database changes need a
reversible Alembic migration. Score edits must create a new revision and preserve performance
timing. External media work must use official APIs and require authorized audio; bypassing DRM or
ripping streams will not be accepted.

Synthetic fixtures are preferred. If a test needs recorded audio, document its license and keep
the smallest useful excerpt. Do not report accuracy on a corpus that is not available to the
evaluator under appropriate rights.
