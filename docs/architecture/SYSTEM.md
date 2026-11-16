# System architecture

Frasi keeps the browser, API, background worker, and signal-processing library as distinct
modules while retaining one repository and one versioned domain model.

```mermaid
flowchart TB
    U[Musician] --> W[Next.js studio]
    W -->|JSON / multipart| API[FastAPI API]
    W --> PLAYER[Web Audio + WaveSurfer]
    W --> SCORE[Verovio score renderer]
    API --> DB[(PostgreSQL)]
    API --> STORE[(S3-compatible object storage)]
    API --> Q[Redis / Celery]
    Q --> WORKER[Python transcription worker]
    WORKER --> SEP[HPSS / optional Demucs]
    SEP --> AMT[pYIN pitch + onset detection]
    AMT --> RHYTHM[Beat-aware rhythm hypotheses]
    RHYTHM --> SYMBOLIC[Concert-pitch symbolic score]
    SYMBOLIC --> HARMONY[Deterministic harmonic analysis]
    SYMBOLIC --> EXPORTS[MusicXML + MIDI exports]
    WORKER --> DB
    WORKER --> STORE
    DB --> API
    STORE --> API
    SCORE --> PRACTICE[Twelve-key practice]
    SCORE --> LIBRARY[Vocabulary library]
```

## Design boundaries

- Concert pitch is canonical. Instrument notation and practice transposition are derived,
  independent views.
- Performance timing is immutable evidence. Symbolic timing is an editable interpretation.
- Uploaded audio lives in object storage, never in relational rows.
- The API owns authorization. Storage identifiers are opaque and are never accepted as direct
  filesystem paths.
- Processing stages emit confidence and versioned intermediate artifacts so a correction can be
  traced to its source.

## Component architecture

```mermaid
flowchart LR
    subgraph Browser
      SHELL[Application shell]
      STORE[Zustand studio state]
      WAVE[Waveform + selection]
      NOTATION[Notation + editor]
      TRANSPORT[Transport]
      PRACTICE[Practice workspace]
      VOCAB[Vocabulary workspace]
      SHELL --> STORE
      STORE --> WAVE
      STORE --> NOTATION
      STORE --> TRANSPORT
      STORE --> PRACTICE
      STORE --> VOCAB
    end
    subgraph Server
      ROUTES[Versioned routes]
      AUTH[Identity + policy]
      DOMAIN[Transcription domain]
      JOBS[Job dispatcher]
      ROUTES --> AUTH
      ROUTES --> DOMAIN
      DOMAIN --> JOBS
    end
    Browser --> ROUTES
```

## Deployment architecture

```mermaid
flowchart TB
    INTERNET[HTTPS clients] --> EDGE[.chatgpt.site edge]
    EDGE --> WEB[Next.js frontend]
    WEB --> API[Container API]
    API --> PG[(Managed PostgreSQL)]
    API --> REDIS[(Managed Redis)]
    API --> S3[(S3-compatible storage)]
    REDIS --> CPU[CPU transcription workers]
    REDIS --> GPU[Optional GPU separation workers]
    CPU --> S3
    GPU --> S3
    API --> OTEL[OpenTelemetry collector]
    CPU --> OTEL
    GPU --> OTEL
```

The Sites edge can host the web surface. The Python API, database, queue, object storage, and
workers require separately provisioned production infrastructure; a frontend-only deployment is
not classified as a complete Frasi production deployment.
