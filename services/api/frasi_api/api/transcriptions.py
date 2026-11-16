from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from frasi_api.database import get_session
from frasi_api.models import AudioAsset, Recording, TranscriptionJob, TranscriptionProject
from frasi_api.queue import dispatch_job
from frasi_api.rate_limit import rate_limit
from frasi_api.schemas.transcriptions import (
    INSTRUMENTS,
    JobResponse,
    TranscriptionCreate,
    TranscriptionPatch,
    TranscriptionResponse,
)
from frasi_api.security import CurrentUser

router = APIRouter(tags=["transcriptions"])


async def owned_project(
    session: AsyncSession, project_id: str, owner_id: str
) -> TranscriptionProject:
    project = await session.get(TranscriptionProject, project_id)
    if project is None or project.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transcription not found")
    return project


@router.post(
    "/transcriptions",
    response_model=TranscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_transcription(
    payload: TranscriptionCreate,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TranscriptionProject:
    recording = await session.get(Recording, payload.recording_id)
    if recording is None or recording.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    original_asset = await session.scalar(
        select(AudioAsset.id).where(
            AudioAsset.recording_id == recording.id,
            AudioAsset.kind == "original",
        )
    )
    if original_asset is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Upload audio you are authorized to use before transcribing this reference",
        )
    if payload.segment_end_seconds > recording.duration_seconds + 0.05:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Segment extends beyond the recording",
        )
    project = TranscriptionProject(owner_id=user.id, **payload.model_dump())
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.get("/transcriptions", response_model=list[TranscriptionResponse])
async def list_transcriptions(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TranscriptionProject]:
    projects = await session.scalars(
        select(TranscriptionProject)
        .where(TranscriptionProject.owner_id == user.id)
        .order_by(TranscriptionProject.updated_at.desc())
        .limit(100)
    )
    return list(projects)


@router.get("/transcriptions/{project_id}", response_model=TranscriptionResponse)
async def get_transcription(
    project_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TranscriptionProject:
    return await owned_project(session, project_id, user.id)


@router.patch("/transcriptions/{project_id}", response_model=TranscriptionResponse)
async def patch_transcription(
    project_id: str,
    payload: TranscriptionPatch,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TranscriptionProject:
    project = await owned_project(session, project_id, user.id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("instrument_id") not in INSTRUMENTS and "instrument_id" in values:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported instrument",
        )
    for field, value in values.items():
        setattr(project, field, value)
    await session.commit()
    await session.refresh(project)
    return project


@router.post(
    "/transcriptions/{project_id}/process",
    response_model=JobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("transcription-process", 60, 3600))],
)
async def process_transcription(
    project_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
) -> TranscriptionJob:
    await owned_project(session, project_id, user.id)
    existing = await session.scalar(
        select(TranscriptionJob).where(
            TranscriptionJob.project_id == project_id,
            TranscriptionJob.idempotency_key == idempotency_key,
        )
    )
    if existing is not None:
        return existing
    job = TranscriptionJob(
        project_id=project_id,
        idempotency_key=idempotency_key,
        status="queued",
        stage="waiting_for_worker",
        progress=0,
    )
    session.add(job)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(TranscriptionJob).where(
                TranscriptionJob.project_id == project_id,
                TranscriptionJob.idempotency_key == idempotency_key,
            )
        )
        if existing is None:
            raise
        return existing
    await session.refresh(job)
    try:
        dispatch_job(job.id)
    except Exception as exc:
        job.status = "failed"
        job.stage = "dispatch_failed"
        job.error_code = "queue_unavailable"
        job.error_message = "The transcription queue is temporarily unavailable"
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transcription queue is unavailable",
        ) from exc
    return job


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TranscriptionJob:
    job = await session.get(TranscriptionJob, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    await owned_project(session, job.project_id, user.id)
    return job
