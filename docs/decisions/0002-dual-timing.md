# ADR 0002: Preserve performance and symbolic timing

- Status: accepted
- Date: 2026-11-16

## Decision

Store detected performance onset/offset seconds separately from editable symbolic measure, beat,
duration, tie, and tuplet values. Concert pitch is canonical.

## Rationale

Quantization is an interpretation, especially for swing and rubato. Destructive rounding would make
later correction, re-quantization, and score-to-audio alignment unreliable.
