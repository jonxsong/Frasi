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

The test verifies the source hash and exact selection, then exercises the same browser model,
lead-line selector, rhythm quantizer, and tenor-part projection used by the public studio. Its
current quality gates require:

- an 86 BPM browser estimate (the independent backend beat tracker reports about 89 BPM);
- a `Tenor Saxophone in B♭` MusicXML part;
- every written note at or above the tenor's hard lower floor, B♭3 (MIDI 58), while
  preserving valid altissimo above the conventional F♯6 ceiling;
- zero accompaniment notes below the corresponding concert range;
- stable note, measure, rest, beam, tie, tuplet, and normalized MusicXML counts.

The Playwright result also attaches the exported MusicXML and a full-page score screenshot.

The committed expectation is a regression and playability baseline, not a claim of
human-verified note-for-note accuracy. It catches the concrete failures that motivated it:
bass/accompaniment leakage, impossible tenor notes, concert-versus-written-pitch confusion,
unstable tempo, and rhythm-engraving regressions. Any transcription-engine change must be
compared against this same window; update the snapshot only after reviewing the score and
listening against the phrase.
