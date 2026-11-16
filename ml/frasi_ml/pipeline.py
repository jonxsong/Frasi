from pathlib import Path
from time import perf_counter

import numpy as np

from .audio import load_audio, separate_harmonic
from .instrument import estimate_instrument
from .musicxml import create_musicxml
from .pitch import detect_notes
from .rhythm import estimate_tempo, quantize_notes
from .types import TranscriptionResult


class TranscriptionPipeline:
    def transcribe_file(
        self,
        path: str | Path,
        *,
        start: float = 0,
        duration: float | None = None,
        instrument: str | None = None,
    ) -> TranscriptionResult:
        signal, sample_rate = load_audio(path, start=start, duration=duration)
        return self.transcribe_array(signal, sample_rate, instrument=instrument)

    def transcribe_array(
        self,
        signal: np.ndarray,
        sample_rate: int,
        *,
        instrument: str | None = None,
    ) -> TranscriptionResult:
        started = perf_counter()
        harmonic, percussive = separate_harmonic(signal)
        separated_at = perf_counter()
        performance_notes, pitch_metrics = detect_notes(harmonic, percussive, sample_rate)
        if not performance_notes:
            raise ValueError("No stable monophonic notes were detected in this segment")
        pitched_at = perf_counter()
        bpm, tempo_map = estimate_tempo(percussive, sample_rate)
        symbolic_notes = quantize_notes(performance_notes, bpm)
        rhythm_at = perf_counter()
        estimate = estimate_instrument(
            harmonic,
            sample_rate,
            float(np.median([event.midi_pitch for event in performance_notes])),
        )
        selected_instrument = instrument or estimate.instrument
        musicxml = create_musicxml(symbolic_notes, bpm)
        finished = perf_counter()
        return TranscriptionResult(
            notes=symbolic_notes,
            tempo_map=tempo_map,
            estimated_bpm=bpm,
            time_signature=(4, 4),
            instrument=selected_instrument,
            instrument_confidence=1.0 if instrument else estimate.confidence,
            musicxml=musicxml,
            stage_metrics={
                **pitch_metrics,
                "source_separation_seconds": separated_at - started,
                "pitch_detection_seconds": pitched_at - separated_at,
                "rhythm_seconds": rhythm_at - pitched_at,
                "score_seconds": finished - rhythm_at,
                "instrument_evidence": estimate.evidence,
            },
        )
