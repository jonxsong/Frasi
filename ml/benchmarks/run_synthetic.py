"""Measure the DSP pipeline on generated monophonic phrases with known ground truth.

This suite is deliberately synthetic and is not a proxy for accuracy on commercial jazz
recordings. It exists to catch pitch/onset regressions without distributing copyrighted audio.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from time import perf_counter

import numpy as np

from frasi_ml import TranscriptionPipeline

SAMPLE_RATE = 22_050
PITCH_TOLERANCE_SEMITONES = 1
ONSET_TOLERANCE_SECONDS = 0.16


@dataclass(frozen=True)
class BenchmarkCase:
    name: str
    pitches: tuple[int, ...]
    note_seconds: float = 0.48
    gap_seconds: float = 0.04


CASES = (
    BenchmarkCase("middle_register_arpeggio", (60, 64, 67, 71)),
    BenchmarkCase("tenor_register_phrase", (50, 53, 57, 62)),
    BenchmarkCase("upper_register_phrase", (72, 74, 77, 81)),
    BenchmarkCase("repeated_note_attacks", (60, 60, 67, 67)),
)


def synthesize(case: BenchmarkCase) -> tuple[np.ndarray, list[tuple[int, float]]]:
    chunks: list[np.ndarray] = []
    expected: list[tuple[int, float]] = []
    cursor = 0.0
    for midi in case.pitches:
        expected.append((midi, cursor))
        samples = int(case.note_seconds * SAMPLE_RATE)
        time = np.arange(samples) / SAMPLE_RATE
        frequency = 440.0 * 2 ** ((midi - 69) / 12)
        attack = np.minimum(1, time / 0.015)
        release = np.minimum(1, (case.note_seconds - time) / 0.03)
        tone = 0.55 * np.sin(2 * np.pi * frequency * time) * attack * release
        click = np.zeros(samples)
        click[:100] = np.hanning(200)[:100] * 0.25
        chunks.append(tone + click)
        chunks.append(np.zeros(int(case.gap_seconds * SAMPLE_RATE)))
        cursor += case.note_seconds + case.gap_seconds
    return np.asarray(np.concatenate(chunks), dtype=np.float32), expected


def match_events(expected: list[tuple[int, float]], detected: list[tuple[int, float]]) -> int:
    candidates: list[tuple[float, int, int]] = []
    for expected_index, (expected_pitch, expected_onset) in enumerate(expected):
        for detected_index, (detected_pitch, detected_onset) in enumerate(detected):
            pitch_error = abs(expected_pitch - detected_pitch)
            onset_error = abs(expected_onset - detected_onset)
            if pitch_error <= PITCH_TOLERANCE_SEMITONES and onset_error <= ONSET_TOLERANCE_SECONDS:
                candidates.append((pitch_error + onset_error, expected_index, detected_index))
    matched_expected: set[int] = set()
    matched_detected: set[int] = set()
    for _, expected_index, detected_index in sorted(candidates):
        if expected_index in matched_expected or detected_index in matched_detected:
            continue
        matched_expected.add(expected_index)
        matched_detected.add(detected_index)
    return len(matched_expected)


def evaluate() -> dict[str, object]:
    pipeline = TranscriptionPipeline()
    case_results: list[dict[str, object]] = []
    total_expected = 0
    total_detected = 0
    total_matches = 0
    total_audio_seconds = 0.0
    total_processing_seconds = 0.0

    for case in CASES:
        signal, expected = synthesize(case)
        started = perf_counter()
        result = pipeline.transcribe_array(signal, SAMPLE_RATE, instrument="tenor_saxophone")
        processing_seconds = perf_counter() - started
        detected = [(note.concert_midi, note.performance.onset_seconds) for note in result.notes]
        matches = match_events(expected, detected)
        precision = matches / len(detected) if detected else 0.0
        recall = matches / len(expected)
        audio_seconds = len(signal) / SAMPLE_RATE
        case_results.append(
            {
                "name": case.name,
                "expected_events": len(expected),
                "detected_events": len(detected),
                "matched_events": matches,
                "event_precision": round(precision, 4),
                "event_recall": round(recall, 4),
                "audio_seconds": round(audio_seconds, 4),
                "processing_seconds": round(processing_seconds, 4),
                "musicxml_valid": "<score-partwise" in result.musicxml,
            }
        )
        total_expected += len(expected)
        total_detected += len(detected)
        total_matches += matches
        total_audio_seconds += audio_seconds
        total_processing_seconds += processing_seconds

    return {
        "suite": "frasi-synthetic-monophonic-v1",
        "scope": (
            "generated isolated sine tones with percussive attacks; "
            "not real-recording accuracy"
        ),
        "sample_rate": SAMPLE_RATE,
        "pitch_tolerance_semitones": PITCH_TOLERANCE_SEMITONES,
        "onset_tolerance_seconds": ONSET_TOLERANCE_SECONDS,
        "cases": case_results,
        "summary": {
            "expected_events": total_expected,
            "detected_events": total_detected,
            "matched_events": total_matches,
            "micro_event_precision": round(total_matches / total_detected, 4),
            "micro_event_recall": round(total_matches / total_expected, 4),
            "audio_seconds": round(total_audio_seconds, 4),
            "processing_seconds": round(total_processing_seconds, 4),
            "real_time_factor": round(total_processing_seconds / total_audio_seconds, 4),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail on a material regression")
    args = parser.parse_args()
    report = evaluate()
    print(json.dumps(report, indent=2))
    if args.check:
        summary = report["summary"]
        assert isinstance(summary, dict)
        if float(summary["micro_event_precision"]) < 0.45:
            raise SystemExit("Synthetic event precision regressed below 0.45")
        if float(summary["micro_event_recall"]) < 0.85:
            raise SystemExit("Synthetic event recall regressed below 0.85")
        cases = report["cases"]
        assert isinstance(cases, list)
        if not all(bool(case["musicxml_valid"]) for case in cases):
            raise SystemExit("A synthetic phrase did not produce MusicXML")


if __name__ == "__main__":
    main()
