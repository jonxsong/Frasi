# Transcription pipeline

```mermaid
flowchart LR
    A[Decode + validate] --> B[Resample mono]
    B --> C[Instrument evidence]
    C --> D[Source separation]
    D --> E[Onsets + repeated notes]
    E --> F[pYIN frame pitches]
    F --> G[Note segmentation]
    G --> H[Beat / tempo map]
    H --> I[Rhythm candidates]
    I --> J[Measure reconstruction]
    J --> K[MusicXML + alignment]
    K --> L[Optional harmony analysis]
```

## Quantization objective

For a performance event \(e\), candidate symbolic placement \(q\) minimizes:

```text
timing_error(e, q)
+ duration_error(e, q)
+ notation_complexity(q)
+ continuity_penalty(previous, q)
+ measure_overflow_penalty(q)
```

Candidates include straight subdivisions, dotted values, ties, and tuplets. Swing eighth notes are
represented as swung eighths by default rather than literal triplets. The original onset and offset
remain available for alignment and future reinterpretation.
