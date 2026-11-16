import librosa
import numpy as np

from .types import PerformanceNote


def detect_notes(
    harmonic: np.ndarray,
    percussive: np.ndarray,
    sample_rate: int,
    *,
    fmin: float = 73.42,
    fmax: float = 1396.91,
) -> tuple[list[PerformanceNote], dict[str, float]]:
    hop_length = 256
    onset_envelope = librosa.onset.onset_strength(
        y=percussive, sr=sample_rate, hop_length=hop_length
    )
    onset_frames = librosa.onset.onset_detect(
        onset_envelope=onset_envelope,
        sr=sample_rate,
        hop_length=hop_length,
        backtrack=True,
        units="frames",
    )
    f0, voiced_flag, voiced_probability = librosa.pyin(
        harmonic,
        fmin=fmin,
        fmax=fmax,
        sr=sample_rate,
        frame_length=2048,
        hop_length=hop_length,
        fill_na=np.nan,
    )
    frame_count = len(f0)
    boundaries = sorted(
        {0, *[int(frame) for frame in onset_frames if frame < frame_count], frame_count}
    )
    rms = librosa.feature.rms(y=harmonic, frame_length=2048, hop_length=hop_length)[0]
    notes: list[PerformanceNote] = []
    for start_frame, end_frame in zip(boundaries, boundaries[1:]):
        if end_frame - start_frame < 2:
            continue
        segment_f0 = f0[start_frame:end_frame]
        segment_voicing = voiced_flag[start_frame:end_frame]
        voiced = segment_f0[segment_voicing & np.isfinite(segment_f0)]
        if voiced.size < 2:
            continue
        midi_values = librosa.hz_to_midi(voiced)
        midi_pitch = float(np.median(midi_values))
        pitch_stability = float(np.std(midi_values))
        probabilities = voiced_probability[start_frame:end_frame]
        probability = float(np.nanmean(probabilities)) if probabilities.size else 0.0
        onset_strength = float(onset_envelope[min(start_frame, len(onset_envelope) - 1)])
        normalized_onset = onset_strength / max(float(np.max(onset_envelope)), 1e-6)
        onset = float(librosa.frames_to_time(start_frame, sr=sample_rate, hop_length=hop_length))
        offset = float(librosa.frames_to_time(end_frame, sr=sample_rate, hop_length=hop_length))
        notes.append(
            PerformanceNote(
                onset_seconds=onset,
                offset_seconds=offset,
                midi_pitch=midi_pitch,
                pitch_confidence=max(0.0, min(1.0, probability * np.exp(-pitch_stability))),
                onset_confidence=max(0.0, min(1.0, normalized_onset)),
                rms=float(np.mean(rms[start_frame : min(end_frame, len(rms))])),
            )
        )
    return notes, {
        "onset_count": float(len(onset_frames)),
        "voiced_frame_ratio": float(np.mean(voiced_flag)),
    }
