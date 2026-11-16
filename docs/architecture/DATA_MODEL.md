# Data model

```mermaid
erDiagram
    USER ||--o{ RECORDING : owns
    USER ||--o{ TRANSCRIPTION_PROJECT : owns
    USER ||--o{ VOCABULARY_PHRASE : saves
    USER ||--o{ PRACTICE_SESSION : performs
    RECORDING ||--o{ AUDIO_ASSET : contains
    RECORDING ||--o{ EXTERNAL_REFERENCE : describes
    RECORDING ||--o{ TRANSCRIPTION_PROJECT : sources
    TRANSCRIPTION_PROJECT ||--o{ TRANSCRIPTION_JOB : processes
    TRANSCRIPTION_PROJECT ||--o{ SCORE_REVISION : versions
    SCORE_REVISION ||--o{ MEASURE : contains
    MEASURE ||--o{ VOICE : contains
    VOICE ||--o{ NOTE_EVENT : contains
    MEASURE ||--o{ CHORD_EVENT : harmonizes
    TRANSCRIPTION_PROJECT ||--o{ TEMPO_EVENT : maps
    TRANSCRIPTION_PROJECT ||--o{ EXPORT_JOB : exports
    TRANSCRIPTION_PROJECT ||--o{ VOCABULARY_PHRASE : extracts
    VOCABULARY_PHRASE ||--o{ PRACTICE_SESSION : practices
```

## Timing invariants

Every note event carries both representations:

- `performance_onset_seconds`, `performance_offset_seconds`, detected MIDI pitch, confidence;
- measure index, rational beat position, rational duration, spelling, tuplet, and tie metadata.

Editing symbolic values never overwrites performance timing. Locked chord events survive later AI
reprocessing. A score revision is immutable after publication; edits create a child revision.
