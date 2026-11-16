from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RecordingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    artist: str | None
    album: str | None
    year: int | None
    duration_seconds: float
    source_kind: str
    created_at: datetime


class AudioAssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    media_type: str
    size_bytes: int
    sample_rate: int | None
    channels: int | None
    duration_seconds: float


class RecordingDetail(RecordingResponse):
    assets: list[AudioAssetResponse]
