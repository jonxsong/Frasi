from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def new_id() -> str:
    return str(uuid4())


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SourceKind(StrEnum):
    UPLOAD = "upload"
    YOUTUBE = "youtube"
    SPOTIFY = "spotify"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    display_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    recordings: Mapped[list["Recording"]] = relationship(back_populates="owner")
    projects: Mapped[list["TranscriptionProject"]] = relationship(back_populates="owner")


class Recording(TimestampMixin, Base):
    __tablename__ = "recordings"
    __table_args__ = (Index("ix_recordings_owner_created", "owner_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(300))
    artist: Mapped[str | None] = mapped_column(String(300))
    album: Mapped[str | None] = mapped_column(String(300))
    year: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float] = mapped_column(Float)
    source_kind: Mapped[str] = mapped_column(String(20), default=SourceKind.UPLOAD)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    owner: Mapped[User] = relationship(back_populates="recordings")
    assets: Mapped[list["AudioAsset"]] = relationship(back_populates="recording")
    external_references: Mapped[list["ExternalReference"]] = relationship(
        back_populates="recording"
    )
    projects: Mapped[list["TranscriptionProject"]] = relationship(back_populates="recording")


class AudioAsset(TimestampMixin, Base):
    __tablename__ = "audio_assets"
    __table_args__ = (UniqueConstraint("recording_id", "kind", name="uq_audio_asset_kind"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recording_id: Mapped[str] = mapped_column(ForeignKey("recordings.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(32), default="original")
    storage_key: Mapped[str] = mapped_column(String(512), unique=True)
    media_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    sample_rate: Mapped[int | None] = mapped_column(Integer)
    channels: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[float] = mapped_column(Float)

    recording: Mapped[Recording] = relationship(back_populates="assets")


class ExternalReference(TimestampMixin, Base):
    __tablename__ = "external_references"
    __table_args__ = (UniqueConstraint("provider", "provider_id", name="uq_external_provider_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    recording_id: Mapped[str] = mapped_column(ForeignKey("recordings.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(30))
    provider_id: Mapped[str] = mapped_column(String(200))
    canonical_url: Mapped[str] = mapped_column(String(1000))
    embed_url: Mapped[str | None] = mapped_column(String(1000))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    recording: Mapped[Recording] = relationship(back_populates="external_references")


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(100), unique=True)
    transposition_semitones: Mapped[int] = mapped_column(Integer, default=0)
    clef: Mapped[str] = mapped_column(String(20), default="treble")
    minimum_concert_midi: Mapped[int] = mapped_column(Integer)
    maximum_concert_midi: Mapped[int] = mapped_column(Integer)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)


class TranscriptionProject(TimestampMixin, Base):
    __tablename__ = "transcription_projects"
    __table_args__ = (Index("ix_projects_owner_updated", "owner_id", "updated_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    recording_id: Mapped[str] = mapped_column(ForeignKey("recordings.id", ondelete="CASCADE"))
    instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.id"))
    title: Mapped[str] = mapped_column(String(300))
    segment_start_seconds: Mapped[float] = mapped_column(Float)
    segment_end_seconds: Mapped[float] = mapped_column(Float)
    concert_key: Mapped[str | None] = mapped_column(String(20))
    time_signature_beats: Mapped[int | None] = mapped_column(Integer)
    time_signature_beat_type: Mapped[int | None] = mapped_column(Integer)
    current_revision_id: Mapped[str | None] = mapped_column(String(36))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)

    owner: Mapped[User] = relationship(back_populates="projects")
    recording: Mapped[Recording] = relationship(back_populates="projects")
    jobs: Mapped[list["TranscriptionJob"]] = relationship(back_populates="project")
    revisions: Mapped[list["ScoreRevision"]] = relationship(back_populates="project")


class TranscriptionJob(TimestampMixin, Base):
    __tablename__ = "transcription_jobs"
    __table_args__ = (
        UniqueConstraint("project_id", "idempotency_key", name="uq_job_idempotency"),
        Index("ix_jobs_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("transcription_projects.id", ondelete="CASCADE")
    )
    idempotency_key: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.QUEUED)
    stage: Mapped[str | None] = mapped_column(String(80))
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    intermediate_manifest: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    project: Mapped[TranscriptionProject] = relationship(back_populates="jobs")


class ScoreRevision(TimestampMixin, Base):
    __tablename__ = "score_revisions"
    __table_args__ = (UniqueConstraint("project_id", "revision", name="uq_score_revision"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("transcription_projects.id", ondelete="CASCADE")
    )
    parent_revision_id: Mapped[str | None] = mapped_column(ForeignKey("score_revisions.id"))
    revision: Mapped[int] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(30), default="transcription")
    musicxml: Mapped[str] = mapped_column(Text)
    edit_summary: Mapped[str | None] = mapped_column(Text)

    project: Mapped[TranscriptionProject] = relationship(back_populates="revisions")
    measures: Mapped[list["Measure"]] = relationship(back_populates="revision")
    tempo_events: Mapped[list["TempoEvent"]] = relationship(back_populates="revision")


class Measure(Base):
    __tablename__ = "measures"
    __table_args__ = (UniqueConstraint("revision_id", "number", name="uq_measure_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    revision_id: Mapped[str] = mapped_column(ForeignKey("score_revisions.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)
    beats: Mapped[int] = mapped_column(Integer)
    beat_type: Mapped[int] = mapped_column(Integer)
    pickup: Mapped[bool] = mapped_column(Boolean, default=False)

    revision: Mapped[ScoreRevision] = relationship(back_populates="measures")
    voices: Mapped[list["Voice"]] = relationship(back_populates="measure")
    chord_events: Mapped[list["ChordEvent"]] = relationship(back_populates="measure")


class Voice(Base):
    __tablename__ = "voices"
    __table_args__ = (UniqueConstraint("measure_id", "number", name="uq_measure_voice"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    measure_id: Mapped[str] = mapped_column(ForeignKey("measures.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer, default=1)

    measure: Mapped[Measure] = relationship(back_populates="voices")
    notes: Mapped[list["NoteEvent"]] = relationship(back_populates="voice")


class NoteEvent(Base):
    __tablename__ = "note_events"
    __table_args__ = (Index("ix_notes_voice_position", "voice_id", "beat_numerator"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    voice_id: Mapped[str] = mapped_column(ForeignKey("voices.id", ondelete="CASCADE"))
    concert_midi: Mapped[int | None] = mapped_column(Integer)
    spelling: Mapped[str | None] = mapped_column(String(20))
    is_rest: Mapped[bool] = mapped_column(Boolean, default=False)
    performance_onset_seconds: Mapped[float] = mapped_column(Float)
    performance_offset_seconds: Mapped[float] = mapped_column(Float)
    pitch_confidence: Mapped[float | None] = mapped_column(Float)
    onset_confidence: Mapped[float | None] = mapped_column(Float)
    beat_numerator: Mapped[int] = mapped_column(Integer)
    beat_denominator: Mapped[int] = mapped_column(Integer, default=1)
    duration_numerator: Mapped[int] = mapped_column(Integer)
    duration_denominator: Mapped[int] = mapped_column(Integer, default=1)
    tuplet_actual: Mapped[int | None] = mapped_column(Integer)
    tuplet_normal: Mapped[int | None] = mapped_column(Integer)
    tie_start: Mapped[bool] = mapped_column(Boolean, default=False)
    tie_stop: Mapped[bool] = mapped_column(Boolean, default=False)
    articulation: Mapped[str | None] = mapped_column(String(30))

    voice: Mapped[Voice] = relationship(back_populates="notes")


class TempoEvent(Base):
    __tablename__ = "tempo_events"
    __table_args__ = (Index("ix_tempo_revision_time", "revision_id", "at_seconds"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    revision_id: Mapped[str] = mapped_column(ForeignKey("score_revisions.id", ondelete="CASCADE"))
    at_seconds: Mapped[float] = mapped_column(Float)
    measure_number: Mapped[int] = mapped_column(Integer)
    beat_numerator: Mapped[int] = mapped_column(Integer)
    beat_denominator: Mapped[int] = mapped_column(Integer, default=1)
    bpm: Mapped[float] = mapped_column(Float)

    revision: Mapped[ScoreRevision] = relationship(back_populates="tempo_events")


class ChordEvent(Base):
    __tablename__ = "chord_events"
    __table_args__ = (Index("ix_chords_measure_position", "measure_id", "beat_numerator"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    measure_id: Mapped[str] = mapped_column(ForeignKey("measures.id", ondelete="CASCADE"))
    beat_numerator: Mapped[int] = mapped_column(Integer)
    beat_denominator: Mapped[int] = mapped_column(Integer, default=1)
    symbol: Mapped[str] = mapped_column(String(80))
    source: Mapped[str] = mapped_column(String(20), default="estimated")
    confidence: Mapped[float | None] = mapped_column(Float)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)

    measure: Mapped[Measure] = relationship(back_populates="chord_events")


class VocabularyPhrase(TimestampMixin, Base):
    __tablename__ = "vocabulary_phrases"
    __table_args__ = (Index("ix_vocabulary_owner_updated", "owner_id", "updated_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[str] = mapped_column(
        ForeignKey("transcription_projects.id", ondelete="CASCADE")
    )
    revision_id: Mapped[str] = mapped_column(ForeignKey("score_revisions.id"))
    title: Mapped[str] = mapped_column(String(200))
    start_measure: Mapped[int] = mapped_column(Integer)
    end_measure: Mapped[int] = mapped_column(Integer)
    source_start_seconds: Mapped[float] = mapped_column(Float)
    source_end_seconds: Mapped[float] = mapped_column(Float)
    original_key: Mapped[str | None] = mapped_column(String(20))
    original_instrument_id: Mapped[str] = mapped_column(ForeignKey("instruments.id"))
    tags: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    score_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)


class PracticeSession(TimestampMixin, Base):
    __tablename__ = "practice_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    phrase_id: Mapped[str | None] = mapped_column(
        ForeignKey("vocabulary_phrases.id", ondelete="SET NULL")
    )
    project_id: Mapped[str | None] = mapped_column(
        ForeignKey("transcription_projects.id", ondelete="SET NULL")
    )
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    tempo_bpm: Mapped[float] = mapped_column(Float)
    practiced_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    mastered_keys: Mapped[list[str]] = mapped_column(JSON, default=list)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ExportJob(TimestampMixin, Base):
    __tablename__ = "export_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    project_id: Mapped[str] = mapped_column(
        ForeignKey("transcription_projects.id", ondelete="CASCADE")
    )
    revision_id: Mapped[str] = mapped_column(ForeignKey("score_revisions.id"))
    format: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), default=JobStatus.QUEUED)
    storage_key: Mapped[str | None] = mapped_column(String(512))
    error_message: Mapped[str | None] = mapped_column(Text)
    artifact_checksum: Mapped[bytes | None] = mapped_column(LargeBinary(32))
