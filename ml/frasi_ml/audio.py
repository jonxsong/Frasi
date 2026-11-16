from pathlib import Path

import librosa
import numpy as np
import soundfile as sf

TARGET_SAMPLE_RATE = 22_050


class AudioDecodeError(ValueError):
    pass


def load_audio(
    path: str | Path, *, start: float = 0, duration: float | None = None
) -> tuple[np.ndarray, int]:
    try:
        info = sf.info(str(path))
    except (RuntimeError, TypeError) as exc:
        raise AudioDecodeError("Audio file cannot be decoded") from exc
    if info.frames <= 0 or info.samplerate < 8000 or info.channels < 1:
        raise AudioDecodeError("Audio stream has invalid metadata")
    if start < 0 or (duration is not None and duration <= 0):
        raise AudioDecodeError("Audio segment bounds are invalid")
    signal, sample_rate = librosa.load(
        path,
        sr=TARGET_SAMPLE_RATE,
        mono=True,
        offset=start,
        duration=duration,
        res_type="soxr_hq",
    )
    if signal.size == 0 or not np.isfinite(signal).all():
        raise AudioDecodeError("Audio segment contains no finite samples")
    peak = float(np.max(np.abs(signal)))
    if peak < 1e-5:
        raise AudioDecodeError("Audio segment is silent")
    return np.asarray(signal / max(peak, 1.0), dtype=np.float32), sample_rate


def separate_harmonic(signal: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    harmonic, percussive = librosa.effects.hpss(signal, margin=(1.0, 2.5))
    return np.asarray(harmonic), np.asarray(percussive)
