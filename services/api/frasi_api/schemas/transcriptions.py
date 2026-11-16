from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

INSTRUMENTS = {
    "alto_saxophone",
    "tenor_saxophone",
    "soprano_saxophone",
    "baritone_saxophone",
    "trumpet",
    "trombone",
}


class TranscriptionCreate(BaseModel):
    recording_id: str
    title: str = Field(min_length=1, max_length=300)
    instrument_id: str
    segment_start_seconds: float = Field(ge=0)
    segment_end_seconds: float = Field(gt=0)

    @model_validator(mode="after")
    def validate_segment(self) -> "TranscriptionCreate":
        if self.instrument_id not in INSTRUMENTS:
            raise ValueError("Unsupported initial-release instrument")
        if self.segment_end_seconds <= self.segment_start_seconds:
            raise ValueError("Segment end must be after segment start")
        if self.segment_end_seconds - self.segment_start_seconds > 600:
            raise ValueError("A transcription segment cannot exceed ten minutes")
        return self


class TranscriptionPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    instrument_id: str | None = None
    is_public: bool | None = None


class TranscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    recording_id: str
    instrument_id: str
    title: str
    segment_start_seconds: float
    segment_end_seconds: float
    concert_key: str | None
    time_signature_beats: int | None
    time_signature_beat_type: int | None
    current_revision_id: str | None
    is_public: bool
    created_at: datetime
    updated_at: datetime


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    status: str
    stage: str | None
    progress: float
    attempts: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
