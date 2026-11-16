# Transcription benchmark record

Frasi reports only results that can be reproduced from checked-in code and distributable
inputs. The current repository includes a synthetic regression suite; it does **not** include a
licensed corpus of commercial jazz solos, so these figures must not be read as real-recording
accuracy.

## Synthetic monophonic v1

Run from the repository root:

```powershell
.\.venv\Scripts\python.exe ml/benchmarks/run_synthetic.py --check
```

On 2026-11-16, the CPU run used four generated four-note phrases spanning MIDI 50–81,
including repeated attacks. A match allows one semitone of pitch error and 160 ms of onset
error.

| Metric | Verified result |
| --- | ---: |
| Expected events | 16 |
| Detected events | 27 |
| Matched events | 16 |
| Micro event precision | 0.5926 |
| Micro event recall | 1.0000 |
| MusicXML generation | 4 / 4 cases |
| Audio duration | 8.32 s |
| Processing time, mixed cold/warm CPU run | 5.50 s |
| Real-time factor | 0.66× |

The excess detections are mostly repeated segmentation within a sustained pitch. The CI guard
therefore enforces recall ≥ 0.85 and precision ≥ 0.45 while improvements focus on event-boundary
precision. Runtime is recorded but not thresholded because runner hardware and first-call JIT
cost vary.

## Real-recording acceptance gate

A claim about jazz-recording accuracy remains blocked until the project has a legally
redistributable or privately licensed evaluation set with note-level ground truth. The intended
evaluation reports onset-with-offset F1, raw pitch accuracy, note-event precision/recall,
quantized rhythm accuracy, and MusicXML validity by instrument and recording condition.
