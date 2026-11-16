from dataclasses import dataclass

import librosa
import numpy as np


@dataclass(frozen=True)
class InstrumentEstimate:
    instrument: str
    confidence: float
    evidence: dict[str, float]


def estimate_instrument(
    signal: np.ndarray, sample_rate: int, median_midi: float
) -> InstrumentEstimate:
    centroid = float(np.median(librosa.feature.spectral_centroid(y=signal, sr=sample_rate)))
    rolloff = float(
        np.median(librosa.feature.spectral_rolloff(y=signal, sr=sample_rate, roll_percent=0.85))
    )
    if median_midi < 48:
        instrument = "baritone_saxophone"
    elif median_midi < 55 and centroid < 1800:
        instrument = "trombone"
    elif median_midi > 73 and centroid < 2400:
        instrument = "soprano_saxophone"
    elif centroid > 2600:
        instrument = "trumpet"
    elif median_midi > 64:
        instrument = "alto_saxophone"
    else:
        instrument = "tenor_saxophone"
    # This is intentionally conservative: range/timbre heuristics are supporting evidence,
    # never a substitute for the musician's manual instrument choice.
    distance = min(1.0, abs(centroid - 2200) / 2200)
    confidence = 0.42 + 0.22 * distance
    return InstrumentEstimate(
        instrument=instrument,
        confidence=round(confidence, 3),
        evidence={"median_midi": median_midi, "spectral_centroid": centroid, "rolloff": rolloff},
    )
