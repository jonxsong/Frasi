from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

VALID_KEYS = {
    "C",
    "Db",
    "D",
    "Eb",
    "E",
    "F",
    "Gb",
    "G",
    "Ab",
    "A",
    "Bb",
    "B",
}


class VocabularyCreate(BaseModel):
    project_id: str
    revision_id: str
    title: str = Field(min_length=1, max_length=200)
    start_measure: int = Field(gt=0)
    end_measure: int = Field(gt=0)
    source_start_seconds: float = Field(ge=0)
    source_end_seconds: float = Field(gt=0)
    tags: list[str] = Field(default_factory=list, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def validate_range(self) -> "VocabularyCreate":
        if self.end_measure < self.start_measure:
            raise ValueError("End measure must not precede start measure")
        if self.source_end_seconds <= self.source_start_seconds:
            raise ValueError("Source end must be after source start")
        self.tags = sorted({tag.strip().lower() for tag in self.tags if tag.strip()})
        return self


class VocabularyPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    tags: list[str] | None = Field(default=None, max_length=20)
    notes: str | None = Field(default=None, max_length=4000)


class VocabularyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    revision_id: str
    title: str
    start_measure: int
    end_measure: int
    source_start_seconds: float
    source_end_seconds: float
    original_key: str | None
    original_instrument_id: str
    tags: list[str]
    notes: str | None
    score_snapshot: dict
    created_at: datetime
    updated_at: datetime


class PracticeCreate(BaseModel):
    phrase_id: str | None = None
    project_id: str | None = None
    duration_seconds: float = Field(ge=0, le=86400)
    tempo_bpm: float = Field(gt=0, le=400)
    practiced_keys: list[str] = Field(default_factory=list)
    mastered_keys: list[str] = Field(default_factory=list)
    completed: bool = True

    @model_validator(mode="after")
    def validate_practice(self) -> "PracticeCreate":
        if self.phrase_id is None and self.project_id is None:
            raise ValueError("Practice must reference a phrase or transcription")
        if not set(self.practiced_keys).issubset(VALID_KEYS):
            raise ValueError("Unknown practiced key")
        if not set(self.mastered_keys).issubset(VALID_KEYS):
            raise ValueError("Unknown mastered key")
        if not set(self.mastered_keys).issubset(self.practiced_keys):
            raise ValueError("Mastered keys must also be practiced")
        self.practiced_keys = sorted(set(self.practiced_keys))
        self.mastered_keys = sorted(set(self.mastered_keys))
        return self


class PracticeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    phrase_id: str | None
    project_id: str | None
    duration_seconds: float
    tempo_bpm: float
    practiced_keys: list[str]
    mastered_keys: list[str]
    completed_at: datetime | None
    created_at: datetime


class PracticeSummary(BaseModel):
    session_count: int
    duration_seconds: float
    practiced_keys: list[str]
    mastered_keys: list[str]
    recent_sessions: list[PracticeResponse]
