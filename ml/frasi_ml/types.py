from dataclasses import dataclass, field
from fractions import Fraction
from typing import Any


@dataclass(frozen=True)
class PerformanceNote:
    onset_seconds: float
    offset_seconds: float
    midi_pitch: float
    pitch_confidence: float
    onset_confidence: float
    rms: float


@dataclass(frozen=True)
class SymbolicNote:
    performance: PerformanceNote
    measure: int
    beat: Fraction
    duration: Fraction
    concert_midi: int
    spelling: str
    tuplet: tuple[int, int] | None = None
    tie_start: bool = False
    tie_stop: bool = False


@dataclass(frozen=True)
class TempoPoint:
    at_seconds: float
    bpm: float
    beat_index: int


@dataclass
class TranscriptionResult:
    notes: list[SymbolicNote]
    tempo_map: list[TempoPoint]
    estimated_bpm: float
    time_signature: tuple[int, int]
    instrument: str
    instrument_confidence: float
    musicxml: str
    stage_metrics: dict[str, Any] = field(default_factory=dict)
