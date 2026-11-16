from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class NoteResponse(BaseModel):
    id: str
    concert_midi: int | None
    spelling: str | None
    is_rest: bool
    performance_onset_seconds: float
    performance_offset_seconds: float
    pitch_confidence: float | None
    onset_confidence: float | None
    beat_numerator: int
    beat_denominator: int
    duration_numerator: int
    duration_denominator: int
    tuplet_actual: int | None
    tuplet_normal: int | None
    tie_start: bool
    tie_stop: bool
    articulation: str | None


class ChordResponse(BaseModel):
    id: str
    beat_numerator: int
    beat_denominator: int
    symbol: str
    source: str
    confidence: float | None
    locked: bool


class VoiceResponse(BaseModel):
    number: int
    notes: list[NoteResponse]


class MeasureResponse(BaseModel):
    number: int
    beats: int
    beat_type: int
    pickup: bool
    voices: list[VoiceResponse]
    chords: list[ChordResponse]


class TempoResponse(BaseModel):
    at_seconds: float
    measure_number: int
    beat_numerator: int
    beat_denominator: int
    bpm: float


class ScoreResponse(BaseModel):
    id: str
    project_id: str
    parent_revision_id: str | None
    revision: int
    source: str
    musicxml: str
    edit_summary: str | None
    created_at: datetime
    measures: list[MeasureResponse]
    tempo_map: list[TempoResponse]


class NoteUpdate(BaseModel):
    note_id: str
    concert_midi: int | None = Field(default=None, ge=0, le=127)
    spelling: str | None = Field(default=None, pattern=r"^[A-G](?:#|b)?-?\d$")
    is_rest: bool | None = None
    beat_numerator: int | None = Field(default=None, ge=0)
    beat_denominator: int | None = Field(default=None, gt=0, le=64)
    duration_numerator: int | None = Field(default=None, gt=0)
    duration_denominator: int | None = Field(default=None, gt=0, le=64)
    articulation: str | None = Field(default=None, pattern=r"^(?:accent|staccato|tenuto|marcato)?$")


class ChordUpdate(BaseModel):
    chord_id: str | None = None
    measure_number: int = Field(gt=0)
    beat_numerator: int = Field(ge=0)
    beat_denominator: int = Field(default=1, gt=0, le=64)
    symbol: str | None = Field(default=None, min_length=1, max_length=80)
    delete: bool = False

    @model_validator(mode="after")
    def validate_action(self) -> "ChordUpdate":
        if not self.delete and self.symbol is None:
            raise ValueError("A chord symbol is required unless deleting")
        if self.delete and self.chord_id is None:
            raise ValueError("Deleting a chord requires chord_id")
        return self


class ScorePatch(BaseModel):
    base_revision_id: str
    edit_summary: str = Field(min_length=1, max_length=500)
    note_updates: list[NoteUpdate] = Field(default_factory=list, max_length=500)
    chord_updates: list[ChordUpdate] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def require_changes(self) -> "ScorePatch":
        if not self.note_updates and not self.chord_updates:
            raise ValueError("At least one score change is required")
        return self
