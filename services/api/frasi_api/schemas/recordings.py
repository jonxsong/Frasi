from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


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


class ExternalReferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    provider: str
    provider_id: str
    canonical_url: str
    embed_url: str | None
    metadata_json: dict


class ExternalRecordingCreate(BaseModel):
    provider: str
    url: HttpUrl


class RecordingDetail(RecordingResponse):
    assets: list[AudioAssetResponse]
    external_references: list[ExternalReferenceResponse]
