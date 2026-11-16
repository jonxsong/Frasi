from fractions import Fraction

from frasi_api.database import Base
from frasi_api.models import (
    Instrument,
    JobStatus,
    NoteEvent,
    Recording,
    ScoreRevision,
    TranscriptionJob,
    TranscriptionProject,
    User,
)
from frasi_ml.types import PerformanceNote, SymbolicNote, TempoPoint, TranscriptionResult
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from frasi_worker.tasks import persist_result


async def test_worker_persists_dual_timing_and_revision() -> None:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        instrument = Instrument(
            id="tenor_saxophone",
            display_name="Tenor Saxophone",
            transposition_semitones=14,
            clef="treble",
            minimum_concert_midi=44,
            maximum_concert_midi=76,
            enabled=True,
        )
        user = User(
            email="worker@example.com", password_hash="not-used", display_name="Worker Test"
        )
        session.add_all([instrument, user])
        await session.flush()
        recording = Recording(
            owner_id=user.id,
            title="Synthetic",
            duration_seconds=1,
            source_kind="upload",
        )
        session.add(recording)
        await session.flush()
        project = TranscriptionProject(
            owner_id=user.id,
            recording_id=recording.id,
            instrument_id=instrument.id,
            title="Test phrase",
            segment_start_seconds=0,
            segment_end_seconds=1,
        )
        session.add(project)
        await session.flush()
        job = TranscriptionJob(
            project_id=project.id,
            idempotency_key="worker-test",
            status=JobStatus.PROCESSING,
        )
        session.add(job)
        await session.commit()

        performance = PerformanceNote(0.123, 0.61, 69.02, 0.94, 0.87, 0.4)
        symbolic = SymbolicNote(
            performance=performance,
            measure=1,
            beat=Fraction(1, 4),
            duration=Fraction(1),
            concert_midi=69,
            spelling="A4",
        )
        result = TranscriptionResult(
            notes=[symbolic],
            tempo_map=[TempoPoint(0, 120, 0)],
            estimated_bpm=120,
            time_signature=(4, 4),
            instrument="tenor_saxophone",
            instrument_confidence=1,
            musicxml="<score-partwise/>",
        )
        revision = await persist_result(session, project, job, result)

        assert revision.revision == 1
        assert project.current_revision_id == revision.id
        assert job.status == JobStatus.SUCCEEDED
        stored = await session.scalar(select(NoteEvent))
        assert stored is not None
        assert stored.performance_onset_seconds == 0.123
        assert (stored.beat_numerator, stored.beat_denominator) == (1, 4)
        assert await session.scalar(select(func.count(ScoreRevision.id))) == 1
    await engine.dispose()
