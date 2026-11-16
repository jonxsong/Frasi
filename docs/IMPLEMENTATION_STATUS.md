# Frasi implementation status

Last updated: 2026-11-16

This ledger records observed behavior only. “Complete” means the current release acceptance
criteria are implemented and tested; it does not imply that a heuristic DSP baseline has the
accuracy of a research-grade transcription model.

## Milestones

| Milestone                        | Status                        | Verified evidence                                                                                                                                                                                                                                             |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repository and architecture      | Complete                      | Modular monorepo, ADRs, normalized domain model, 30+ incremental commits                                                                                                                                                                                      |
| Original brand and design system | Complete                      | Original Frasi emblem, minimal startup-style responsive studio, app/README/icon integration                                                                                                                                                                   |
| Interactive music studio         | Complete                      | Waveform, selection handles, A–B, seeking, speed, volume, keyboard-accessible controls                                                                                                                                                                        |
| Notation and correction          | Complete                      | Verovio rendering, 40–160% zoom, fit-to-view, drag/keyboard resize, zoom-stable ledger lines, rhythmic beams, ties, context-valid triplets, jazz-standard harmony glyphs, click-to-seek, corrections and immutable revisions                                  |
| Music theory engine              | Complete                      | Concert-pitch canonical model, automatic tenor B♭ written pitch, hard low-B♭ floor with altissimo preserved, chromatic practice projections                                                                                                                   |
| Backend infrastructure           | Complete                      | FastAPI, PostgreSQL, Alembic, Redis/Celery, RustFS/S3, readiness/liveness, containers                                                                                                                                                                         |
| Transcription baseline           | Complete with declared scope  | Real HPSS/onset/pYIN pipeline plus browser Basic Pitch, instrument-aware lead extraction, accompaniment rejection, and permanent Hey Lock 1:23–1:43 quality gates                                                                                             |
| Rhythm intelligence              | Complete with declared scope  | Onset-derived tempo; straight, dotted, tied/measure-aware and context-valid tuplet timing; performance time preserved                                                                                                                                         |
| Harmony                          | Complete                      | Deterministic key/mode, chord, Roman numeral, scale and ii–V–I analysis with caveats                                                                                                                                                                          |
| External integrations            | Complete with platform limits | Official YouTube/Spotify metadata plus browser-mediated, user-stopped authorized tab-audio capture and exact phrase selection; no server-side stream extraction                                                                                               |
| Practice and vocabulary          | Complete                      | Twelve-key transposition UI, mastery/session ledger, phrase snapshots and tags                                                                                                                                                                                |
| Exports and sharing              | Complete                      | MusicXML, standard MIDI, printable PDF, Web Share/clipboard links                                                                                                                                                                                             |
| Security and privacy             | Complete for current scope    | Password hashing, rotating sessions, authorization, validation, rate limits, private objects, headers                                                                                                                                                         |
| Quality and CI                   | Complete                      | JS/Python lint, strict types, unit/API/DSP tests, browser E2E, image builds, Compose smoke                                                                                                                                                                    |
| Documentation                    | Complete                      | Setup, architecture, data model, pipeline, benchmark and deployment/operator guidance                                                                                                                                                                         |
| Public guest studio              | Complete                      | Account-free Basic Pitch upload/shared-tab transcription with exact range selection, notation, transposition, practice, browser save, and MusicXML export at [frasi-jazz-studio.perkyaisle4.chatgpt.site](https://frasi-jazz-studio.perkyaisle4.chatgpt.site) |
| Public cloud persistence         | Backend topology pending      | The complete API/DB/queue/storage/worker stack passes locally; managed public infrastructure and credentials are not provisioned                                                                                                                              |

## Verification ledger

| Check                                    | Result observed 2026-11-16                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm lint`                              | Pass                                                                            |
| `pnpm typecheck`                         | Pass across three TypeScript workspaces                                         |
| `pnpm test`                              | 44 tests pass (22 music-core, 22 web)                                           |
| `pnpm build`                             | Optimized Next.js production build passes                                       |
| `pnpm --filter @frasi/web test:e2e`      | 8 pass, 4 intentionally skipped (duplicate mobile ML/capture/resize checks)     |
| `pnpm --filter @frasi/web test:baseline` | Hey Lock 1:23–1:43 passes: 86 BPM, B♭ part, 69 pitched elements, 0 range errors |
| `ruff format --check` and `ruff check`   | 62 files pass                                                                   |
| strict `mypy`                            | 44 Python source files pass                                                     |
| `pytest -q`                              | 26/26 API, worker, harmony, export, practice and DSP tests pass                 |
| synthetic transcription benchmark        | 16/16 expected events matched; precision 0.5926, recall 1.0000                  |
| `docker compose config --quiet`          | Pass                                                                            |
| API/worker/web image builds              | Pass on Python 3.12 and Node 22 production images                               |
| full-stack health                        | PostgreSQL, Redis, RustFS, API, worker and web healthy together                 |
| `infrastructure/scripts/smoke_test.ps1`  | Auth → encrypted upload → job → 8 notes → immutable revision → MusicXML passes  |

## Scope and known limitations

- Hey Lock 1:23–1:43 is a permanent real-recording regression and playability check. It is not a
  note-aligned ground-truth annotation, so a broader claim about real-world accuracy remains
  blocked on a legally usable, expert-annotated evaluation corpus.
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
- The public guest studio runs Spotify Basic Pitch locally, rejects pitches below the target
  instrument's hard lower floor while preserving tenor altissimo, then uses continuity and
  register priors to extract the lead line. It quantizes the result into beamed, tuplet-aware
  notation and produces a B♭ written tenor part. It
  analyzes the user's explicit selection in 30-second model windows, up to ten minutes per pass.
  Dense ensemble mixes and weakly isolated solos still require review and correction.
- Cloud accounts, cross-device persistence, full worker transcription, and server-side exports
  require a separately deployed managed backend topology. They are intentionally de-emphasized
  on the public static release until that infrastructure exists.
