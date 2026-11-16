# Frasi implementation status

Last updated: 2026-11-16

This ledger records observed behavior only. “Complete” means the current release acceptance
criteria are implemented and tested; it does not imply that a heuristic DSP baseline has the
accuracy of a research-grade transcription model.

## Milestones

| Milestone                        | Status                        | Verified evidence                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository and architecture      | Complete                      | Modular monorepo, ADRs, normalized domain model, 30+ incremental commits                                                                                                                                               |
| Original brand and design system | Complete                      | Original Frasi emblem, minimal startup-style responsive studio, app/README/icon integration                                                                                                                            |
| Interactive music studio         | Complete                      | Waveform, selection handles, A–B, seeking, speed, volume, keyboard-accessible controls                                                                                                                                 |
| Notation and correction          | Complete                      | Verovio rendering, 40–160% zoom, fit-to-view, drag/keyboard resize, zoom-stable ledger lines, jazz-standard harmony glyphs, click-to-seek, corrections and immutable revisions                                            |
| Music theory engine              | Complete                      | Concert-pitch canonical model, instrument transposition, chromatic/all-key practice projections                                                                                                                        |
| Backend infrastructure           | Complete                      | FastAPI, PostgreSQL, Alembic, Redis/Celery, RustFS/S3, readiness/liveness, containers                                                                                                                                  |
| Transcription baseline           | Complete with declared scope  | Real HPSS/onset/pYIN/tempo/quantization pipeline for monophonic wind phrases                                                                                                                                           |
| Rhythm intelligence              | Complete with declared scope  | Straight, dotted, tied/measure-aware and tuplet-capable rational timing; performance time preserved                                                                                                                    |
| Harmony                          | Complete                      | Deterministic key/mode, chord, Roman numeral, scale and ii–V–I analysis with caveats                                                                                                                                   |
| External integrations            | Complete with platform limits | Official YouTube/Spotify metadata plus browser-mediated, 20-second authorized tab-audio capture; no server-side stream extraction                                                                                      |
| Practice and vocabulary          | Complete                      | Twelve-key transposition UI, mastery/session ledger, phrase snapshots and tags                                                                                                                                         |
| Exports and sharing              | Complete                      | MusicXML, standard MIDI, printable PDF, Web Share/clipboard links                                                                                                                                                      |
| Security and privacy             | Complete for current scope    | Password hashing, rotating sessions, authorization, validation, rate limits, private objects, headers                                                                                                                  |
| Quality and CI                   | Complete                      | JS/Python lint, strict types, unit/API/DSP tests, browser E2E, image builds, Compose smoke                                                                                                                             |
| Documentation                    | Complete                      | Setup, architecture, data model, pipeline, benchmark and deployment/operator guidance                                                                                                                                  |
| Public guest studio              | Complete                      | Account-free upload/shared-tab transcription, notation, transposition, practice, browser save, and MusicXML export at [frasi-jazz-studio.perkyaisle4.chatgpt.site](https://frasi-jazz-studio.perkyaisle4.chatgpt.site) |
| Public cloud persistence         | Backend topology pending      | The complete API/DB/queue/storage/worker stack passes locally; managed public infrastructure and credentials are not provisioned                                                                                       |

## Verification ledger

| Check                                   | Result observed 2026-11-16                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm lint`                             | Pass                                                                           |
| `pnpm typecheck`                        | Pass across three TypeScript workspaces                                        |
| `pnpm test`                             | 36 tests pass (21 music-core, 15 web)                                          |
| `pnpm build`                            | Optimized Next.js production build passes                                      |
| `pnpm --filter @frasi/web test:e2e`     | 7 pass, 3 intentionally skipped (duplicate mobile DSP/capture/resize checks)   |
| `ruff format --check` and `ruff check`  | 62 files pass                                                                  |
| strict `mypy`                           | 43 Python source files pass                                                    |
| `pytest -q`                             | 22/22 API, worker, harmony, export, practice and DSP tests pass                |
| synthetic transcription benchmark       | 16/16 expected events matched; precision 0.5926, recall 1.0000                 |
| `docker compose config --quiet`         | Pass                                                                           |
| API/worker/web image builds             | Pass on Python 3.12 and Node 22 production images                              |
| full-stack health                       | PostgreSQL, Redis, RustFS, API, worker and web healthy together                |
| `infrastructure/scripts/smoke_test.ps1` | Auth → encrypted upload → job → 8 notes → immutable revision → MusicXML passes |

## Scope and known limitations

- The checked benchmark uses generated tones, not real jazz recordings. A claim about real-world
  transcription accuracy is blocked on a legally usable, note-aligned evaluation corpus.
- The current release targets monophonic saxophone, trumpet, and trombone phrases. Polyphonic
  piano/guitar transcription and ensemble separation are outside this release.
- HPSS is the available CPU separation baseline. Demucs/GPU workers are represented in the
  architecture but are not included or claimed as operational.
- Instrument recognition is heuristic and user override remains authoritative.
- The initial score builder assumes 4/4 and estimates a global tempo. Complex meter inference,
  tempo curves, grace notes, bends, falls, and broad articulation recognition need future work.
- Harmonic analysis is deterministic and score-derived; it presents suggestions and confidence,
  not ground truth.
- YouTube and Spotify integrations intentionally do not download audio. Official API credentials
  and audio-processing rights remain the deployer’s responsibility. Users can instead choose a
  playing browser tab in the browser’s own share picker; capture may be unavailable when the
  platform, browser, DRM policy, or operating system declines to expose an audio track.
- The public guest studio performs real, bounded monophonic analysis in the browser. Its local
  autocorrelation baseline is intentionally lighter than the HPSS/pYIN worker and analyzes only
  the first 20 seconds; users should review the estimated pitches and rhythm.
- Cloud accounts, cross-device persistence, full worker transcription, and server-side exports
  require a separately deployed managed backend topology. They are intentionally de-emphasized
  on the public static release until that infrastructure exists.
