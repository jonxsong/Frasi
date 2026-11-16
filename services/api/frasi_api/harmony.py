from collections.abc import Mapping
from dataclasses import dataclass

from .chords import parse_chord_notation
from .models import ScoreRevision

PITCH_NAMES = ("C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B")
MAJOR_PROFILE = (6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88)
MINOR_PROFILE = (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)
DORIAN_PROFILE = (5.6, 2.2, 4.7, 5.0, 2.4, 3.8, 2.1, 4.9, 2.4, 4.2, 3.0, 2.5)
DEGREE_NAMES = ("I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII")


@dataclass(frozen=True)
class ChordInsight:
    measure: int
    beat: float
    symbol: str
    roman_numeral: str
    confidence: float
    source: str
    likely_scales: tuple[str, ...]
    explanation: str


@dataclass(frozen=True)
class HarmonyAnalysis:
    key: str
    mode: str
    key_confidence: float
    chords: tuple[ChordInsight, ...]
    patterns: tuple[str, ...]
    caveats: tuple[str, ...]


def _rotate(profile: tuple[float, ...], tonic: int) -> tuple[float, ...]:
    return tuple(profile[(pc - tonic) % 12] for pc in range(12))


def estimate_key(pitch_weights: Mapping[int, float]) -> tuple[int, str, float]:
    if not pitch_weights:
        return 0, "major", 0.0
    total = sum(pitch_weights.values())
    candidates: list[tuple[float, int, str]] = []
    for tonic in range(12):
        for mode, profile in (
            ("major", MAJOR_PROFILE),
            ("minor", MINOR_PROFILE),
            ("dorian", DORIAN_PROFILE),
        ):
            score = sum(
                pitch_weights.get(pc, 0.0) * weight
                for pc, weight in enumerate(_rotate(profile, tonic))
            )
            candidates.append((score / total, tonic, mode))
    candidates.sort(reverse=True)
    best, tonic, mode = candidates[0]
    runner_up = candidates[1][0]
    confidence = min(0.92, max(0.15, 0.45 + (best - runner_up) / max(best, 0.01)))
    return tonic, mode, round(confidence, 2)


def parse_chord(symbol: str) -> tuple[int, str]:
    notation = parse_chord_notation(symbol)
    if not notation:
        return 0, "other"
    root = {
        "C": 0,
        "D": 2,
        "E": 4,
        "F": 5,
        "G": 7,
        "A": 9,
        "B": 11,
    }[notation.root_step]
    return (root + notation.root_alter) % 12, notation.quality


def _scale_choices(symbol: str, root: int, quality: str) -> tuple[str, ...]:
    name = PITCH_NAMES[root]
    if quality == "dominant":
        return (f"{name} Mixolydian", f"{name} altered (for tension)")
    if quality == "minor":
        return (f"{name} Dorian", f"{name} melodic minor")
    if quality == "half-diminished":
        return (f"{name} Locrian ♮2", f"{name} Locrian")
    if quality == "diminished":
        return (f"{name} whole-half diminished",)
    return (f"{name} Ionian", f"{name} Lydian")


def _roman(root: int, tonic: int, quality: str) -> str:
    degree = DEGREE_NAMES[(root - tonic) % 12]
    if quality in {"minor", "half-diminished", "diminished"}:
        degree = degree.lower()
    if quality == "half-diminished":
        return f"{degree}ø7"
    if quality == "diminished":
        return f"{degree}°"
    if quality == "dominant":
        return f"{degree}7"
    return degree


def _suggest_chord(pitches: Mapping[int, float], tonic: int, mode: str) -> tuple[str, float]:
    if not pitches:
        return f"{PITCH_NAMES[tonic]}maj7", 0.25
    scale = (0, 2, 4, 5, 7, 9, 11) if mode == "major" else (0, 2, 3, 5, 7, 9, 10)
    qualities = ("maj7", "m7", "m7", "maj7", "7", "m7", "m7b5")
    best: tuple[float, int, str] = (-1, tonic, "maj7")
    total = sum(pitches.values())
    for degree, quality in zip(scale, qualities, strict=True):
        root = (tonic + degree) % 12
        intervals = (
            (0, 4, 7, 11)
            if quality == "maj7"
            else (0, 4, 7, 10)
            if quality == "7"
            else (0, 3, 6, 10)
            if quality == "m7b5"
            else (0, 3, 7, 10)
        )
        chord_tones = {(root + interval) % 12 for interval in intervals}
        score = sum(weight for pc, weight in pitches.items() if pc in chord_tones) / total
        if score > best[0]:
            best = (score, root, quality)
    score, root, quality = best
    return f"{PITCH_NAMES[root]}{quality}", round(min(0.72, 0.28 + score * 0.5), 2)


def analyze_revision(revision: ScoreRevision) -> HarmonyAnalysis:
    global_pitches: dict[int, float] = {}
    measure_pitches: dict[int, dict[int, float]] = {}
    for measure in revision.measures:
        weights: dict[int, float] = {}
        for voice in measure.voices:
            for note in voice.notes:
                if not note.is_rest and note.concert_midi is not None:
                    duration = note.duration_numerator / note.duration_denominator
                    pitch_class = note.concert_midi % 12
                    weights[pitch_class] = weights.get(pitch_class, 0.0) + duration
                    global_pitches[pitch_class] = global_pitches.get(pitch_class, 0.0) + duration
        measure_pitches[measure.number] = weights
    tonic, mode, key_confidence = estimate_key(global_pitches)

    insights: list[ChordInsight] = []
    for measure in sorted(revision.measures, key=lambda item: item.number):
        chords = sorted(
            measure.chord_events,
            key=lambda item: item.beat_numerator / item.beat_denominator,
        )
        if chords:
            symbols = [
                (
                    chord.symbol,
                    chord.beat_numerator / chord.beat_denominator,
                    chord.confidence or 1.0,
                    chord.source,
                )
                for chord in chords
            ]
        else:
            suggestion, confidence = _suggest_chord(measure_pitches[measure.number], tonic, mode)
            symbols = [(suggestion, 0.0, confidence, "melody-derived suggestion")]
        for symbol, beat, confidence, source in symbols:
            root, quality = parse_chord(symbol)
            roman = _roman(root, tonic, quality)
            insights.append(
                ChordInsight(
                    measure=measure.number,
                    beat=beat,
                    symbol=symbol,
                    roman_numeral=roman,
                    confidence=round(confidence, 2),
                    source=source,
                    likely_scales=_scale_choices(symbol, root, quality),
                    explanation=f"{symbol} functions as {roman} in {PITCH_NAMES[tonic]} {mode}.",
                )
            )

    patterns: list[str] = []
    for first, second, third in zip(insights, insights[1:], insights[2:], strict=False):
        roots = [parse_chord(item.symbol)[0] for item in (first, second, third)]
        qualities = [parse_chord(item.symbol)[1] for item in (first, second, third)]
        if (
            roots[1] == (roots[0] + 5) % 12
            and roots[2] == (roots[1] + 5) % 12
            and qualities[0] in {"minor", "half-diminished"}
            and qualities[1] == "dominant"
        ):
            patterns.append(
                f"ii–V–I motion from {first.symbol} through {second.symbol} to {third.symbol}"
            )
    for first, second in zip(insights, insights[1:], strict=False):
        first_root, first_quality = parse_chord(first.symbol)
        second_root, _ = parse_chord(second.symbol)
        if first_quality == "dominant" and second_root == (first_root + 5) % 12:
            patterns.append(f"Dominant resolution: {first.symbol} → {second.symbol}")

    caveats = (
        "Harmony inferred from a monophonic melody is suggestive, not ground truth; "
        "locked user chords take precedence.",
        "Scale choices describe usable pitch collections, not required improvisation rules.",
    )
    return HarmonyAnalysis(
        key=f"{PITCH_NAMES[tonic]} {mode}",
        mode=mode,
        key_confidence=key_confidence,
        chords=tuple(insights),
        patterns=tuple(dict.fromkeys(patterns)),
        caveats=caveats,
    )
