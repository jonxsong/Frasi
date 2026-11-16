<div align="center">

<img src="./apps/web/public/brand/frasi-emblem.png" alt="Frasi's original waveform-and-phrase emblem" width="164" />

# frasi.

### Every note. Every rhythm. Every phrase.

An open-source studio for jazz transcription, harmonic analysis, score correction, and
twelve-key practice.

[![Quality](https://github.com/jonxsong/Frasi/actions/workflows/quality.yml/badge.svg)](https://github.com/jonxsong/Frasi/actions/workflows/quality.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-c8a6ff.svg)](LICENSE)

</div>

Frasi turns authorized audio into an editable concert-pitch score while preserving the
performance timing that produced it. The browser combines a waveform, A–B looping, variable
speed playback, Verovio notation, instrument transposition, harmonic guidance, vocabulary
capture, and practice history in one responsive workspace.

The repository contains working software rather than a UI-only prototype. A FastAPI service,
PostgreSQL schema, encrypted S3-compatible storage, Redis/Celery worker, DSP transcription
pipeline, immutable score revisions, and MusicXML/MIDI/PDF exporters run together under Docker
Compose.

## What is implemented

- Account registration, short-lived JWT access, refresh-token rotation, revocation, ownership
  checks, request IDs, security headers, and Redis-backed rate limits.
- Validated WAV, MP3, FLAC, M4A, and OGG uploads with MIME probing, size limits, SHA-256
  metadata, encrypted object storage, and private bucket initialization.
- Licensed YouTube and Spotify reference metadata through official APIs. Frasi never rips or
  downloads protected streaming audio; users must attach audio they are authorized to process.
- Idempotent background jobs with progress, retry state, health checks, and durable PostgreSQL
  results.
- CPU monophonic DSP using HPSS, onset detection, pYIN pitch tracking, tempo estimation,
  rational rhythm quantization, dotted values, tuplets, dual performance/symbolic timing, and
  MusicXML generation.
- Immutable score correction with optimistic concurrency, note/chord validation, and complete
  revision history.
- Canonical concert-pitch representation with derived alto/tenor/soprano/baritone saxophone,
  trumpet, trombone, chromatic, and all-twelve-key views.
- Deterministic key/mode, chord, Roman-numeral, ii–V–I, and scale-choice analysis with explicit
  confidence and caveats.
- Practice and vocabulary ledgers plus real MusicXML, standard MIDI, and printable PDF exports.
- Unit, API, DSP, responsive browser, strict type, container, migration, and full-stack smoke
  gates in CI.

The exact acceptance ledger and honest limitations are maintained in
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). Synthetic benchmark results
are in [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md).

## Architecture

```text
Next.js / React / Verovio / WaveSurfer
                  │
             HTTPS + JSON
                  │
             FastAPI API
         ┌────────┼──────────┐
    PostgreSQL   Redis      RustFS/S3
                     │
                Celery worker
                     │
        librosa + pYIN + music21
```

Concert pitch is the source of truth. Instrument pitch and twelve-key practice are projections,
so transposition never mutates the stored score. Every note stores both performed seconds and
quantized beat/duration values. See [`docs/architecture/SYSTEM.md`](docs/architecture/SYSTEM.md)
and [`docs/architecture/DATA_MODEL.md`](docs/architecture/DATA_MODEL.md).

## Run the complete stack

Requirements:

- Docker Desktop with Compose v2
- 8 GB of available memory recommended for the DSP worker image
- PowerShell 7 for the included end-to-end smoke script

```powershell
Copy-Item .env.example .env
docker compose up --build --detach
docker compose ps
pwsh -NoProfile -File infrastructure/scripts/smoke_test.ps1
```

Open the studio at [http://localhost:3000](http://localhost:3000), API documentation at
[http://localhost:8000/docs](http://localhost:8000/docs), and the local RustFS console at
[http://localhost:9001](http://localhost:9001). The first worker build is large because it
contains ffmpeg, librosa, Numba, SciPy, and music21.

The smoke test generates its own four-note WAV, registers a disposable account, uploads through
the public API, dispatches the worker, and verifies the persisted score and MusicXML. No bundled
copyrighted recording is used.

Stop the stack without deleting data:

```powershell
docker compose down
```

Add `--volumes` only when you intentionally want to remove the local database, queue, and object
store.

## Native development

Node.js 22+, pnpm 11.25, Python 3.11+, ffmpeg, and libsndfile are required.

```powershell
corepack enable
pnpm install --frozen-lockfile
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".\services\api[dev]" -e ".\ml[dev]" -e .\services\worker
pnpm dev
```

For native API development, the defaults use SQLite and filesystem storage. Set values from
`.env.example` to use PostgreSQL, Redis, and S3-compatible storage.

## Quality gates

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @frasi/web test:e2e

.\.venv\Scripts\python.exe -m ruff format --check services/api services/worker ml
.\.venv\Scripts\python.exe -m ruff check services/api services/worker ml
.\.venv\Scripts\python.exe -m mypy services/api/frasi_api services/worker/frasi_worker ml/frasi_ml
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe ml/benchmarks/run_synthetic.py --check
```

## Configuration and production

Copy `.env.example`, replace every development credential, and use a base64-encoded random
32-byte `FRASI_S3_MASTER_KEY`. Production mode refuses the development JWT secret. External
integration credentials are optional; their routes return an explicit service-unavailable
response when unconfigured.

The local Compose topology is production-shaped, but a public deployment also requires managed
PostgreSQL, Redis, private object storage, worker compute, TLS, backups, monitoring, and secret
management. Follow [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Repository map

```text
apps/web              Next.js transcription and practice studio
services/api          FastAPI application, migrations, and domain API
services/worker       Celery transcription worker
packages/music-core   Symbolic music and transposition engine
packages/shared-types Browser/API contracts
ml/frasi_ml           Signal-processing transcription pipeline
ml/benchmarks         Reproducible, copyright-safe regression suite
infrastructure        Container definitions and smoke tooling
docs                  Architecture, decisions, benchmarks, and operations
```

Contributions are welcome under [`CONTRIBUTING.md`](CONTRIBUTING.md). Report vulnerabilities
privately as described in [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE)
