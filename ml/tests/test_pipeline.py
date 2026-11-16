import numpy as np

from frasi_ml import TranscriptionPipeline


def synthetic_phrase(sample_rate: int = 22_050) -> np.ndarray:
    chunks = []
    for frequency in (440.0, 523.25, 659.25):
        duration = 0.48
        samples = int(duration * sample_rate)
        time = np.arange(samples) / sample_rate
        envelope = np.minimum(1, time / 0.015) * np.minimum(1, (duration - time) / 0.03)
        tone = 0.55 * np.sin(2 * np.pi * frequency * time) * envelope
        click = np.zeros(samples)
        click[:100] = np.hanning(200)[:100] * 0.25
        chunks.append(tone + click)
        chunks.append(np.zeros(int(0.04 * sample_rate)))
    return np.asarray(np.concatenate(chunks), dtype=np.float32)


def test_pipeline_detects_real_synthetic_pitch_sequence() -> None:
    result = TranscriptionPipeline().transcribe_array(
        synthetic_phrase(), 22_050, instrument="tenor_saxophone"
    )
    detected = [note.concert_midi for note in result.notes]
    assert len(detected) >= 3
    for expected in (69, 72, 76):
        assert any(abs(actual - expected) <= 1 for actual in detected)
    assert result.instrument == "tenor_saxophone"
    assert "score-partwise" in result.musicxml
    assert result.stage_metrics["voiced_frame_ratio"] > 0
