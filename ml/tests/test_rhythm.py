from fractions import Fraction

from frasi_ml.rhythm import quantize_notes
from frasi_ml.types import PerformanceNote


def event(onset: float, offset: float, pitch: float = 60) -> PerformanceNote:
    return PerformanceNote(onset, offset, pitch, 0.9, 0.9, 0.4)


def test_quantizes_straight_dotted_and_triplet_values() -> None:
    notes = [
        event(0, 0.5),
        event(0.5, 1.25),
        event(1.5, 1.833),
    ]
    result = quantize_notes(notes, 120)
    assert result[0].duration == Fraction(1)
    assert result[1].duration == Fraction(3, 2)
    assert result[2].duration == Fraction(2, 3)
    assert result[2].tuplet == (3, 2)


def test_preserves_performance_timing_while_quantizing_symbolic_timing() -> None:
    source = event(0.123, 0.617)
    result = quantize_notes([source], 120)[0]
    assert result.performance.onset_seconds == 0.123
    assert result.beat == Fraction(1, 4)
    assert result.duration == Fraction(1)
