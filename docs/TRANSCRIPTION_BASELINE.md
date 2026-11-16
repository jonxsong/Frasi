# Canonical transcription baseline

Frasi's real-audio regression fixture is **Hey Lock.mp3**, identified by SHA-256
`66e34c3472f9b98f52edd323b54afad2ec3f6ac6c913f9ced0048ebf70c61b3c`.
Every transcription-quality comparison uses the same 20-second window:

- Start: `1:23.0` (`83.0` seconds)
- End: `1:43.0` (`103.0` seconds)
- Duration: `20.0` seconds

The source recording is intentionally not committed. On another machine, point
`FRASI_BASELINE_AUDIO` at the exact file before running:

```powershell
$env:FRASI_BASELINE_AUDIO = "C:\path\to\Hey Lock.mp3"
pnpm --filter @frasi/web test:baseline
```

The test verifies the source hash, exact selection, inferred tempo and note-event count,
and a normalized symbolic MusicXML signature. It also records notation structure—measures,
pitched notes, beams, ties, and visible triplet groups—then attaches the exported MusicXML
and a full-page score screenshot to the Playwright result.

The committed expectation is a regression baseline, not a claim of ground-truth musical
accuracy. Any transcription-engine change must be compared against this same window; update
the snapshot only after reviewing whether the score improved.
