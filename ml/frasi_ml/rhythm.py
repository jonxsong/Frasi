from fractions import Fraction

import librosa
import numpy as np

from .types import PerformanceNote, SymbolicNote, TempoPoint

DURATIONS = [
    (Fraction(4), 0.00),
    (Fraction(3), 0.04),
    (Fraction(2), 0.00),
    (Fraction(3, 2), 0.04),
    (Fraction(1), 0.00),
    (Fraction(3, 4), 0.04),
    (Fraction(2, 3), 0.08),
    (Fraction(1, 2), 0.00),
    (Fraction(1, 3), 0.08),
    (Fraction(1, 4), 0.00),
]

SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def estimate_tempo(percussive: np.ndarray, sample_rate: int) -> tuple[float, list[TempoPoint]]:
    tempo, beat_frames = librosa.beat.beat_track(y=percussive, sr=sample_rate, hop_length=256)
    bpm = float(np.asarray(tempo).reshape(-1)[0])
    if not np.isfinite(bpm) or bpm < 40 or bpm > 320:
        bpm = 120.0
    beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=256)
    tempo_map = [TempoPoint(float(at), bpm, index) for index, at in enumerate(beat_times)]
    if not tempo_map:
        tempo_map = [TempoPoint(0.0, bpm, 0)]
    return bpm, tempo_map


def _best_duration(raw_beats: float) -> Fraction:
    scored = [
        (abs(float(value) - raw_beats) + complexity, value) for value, complexity in DURATIONS
    ]
    return min(scored, key=lambda item: item[0])[1]


def _best_onset(raw_beats: float) -> Fraction:
    candidates: set[Fraction] = set()
    for denominator in (2, 3, 4):
        grid = round(raw_beats * denominator)
        candidates.add(Fraction(grid, denominator))
    return min(candidates, key=lambda value: abs(float(value) - raw_beats))


def quantize_notes(
    notes: list[PerformanceNote],
    bpm: float,
    *,
    beats_per_measure: int = 4,
) -> list[SymbolicNote]:
    seconds_per_beat = 60.0 / bpm
    symbolic: list[SymbolicNote] = []
    for note in notes:
        onset_beats = _best_onset(note.onset_seconds / seconds_per_beat)
        duration = _best_duration((note.offset_seconds - note.onset_seconds) / seconds_per_beat)
        measure = int(onset_beats // beats_per_measure) + 1
        beat = onset_beats - (measure - 1) * beats_per_measure
        midi = int(round(note.midi_pitch))
        tuplet = (3, 2) if duration.denominator == 3 else None
        symbolic.append(
            SymbolicNote(
                performance=note,
                measure=measure,
                beat=beat,
                duration=duration,
                concert_midi=midi,
                spelling=f"{SHARP_NAMES[midi % 12]}{midi // 12 - 1}",
                tuplet=tuplet,
            )
        )
    return symbolic
