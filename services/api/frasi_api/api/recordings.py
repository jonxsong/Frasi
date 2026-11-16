from hashlib import sha256
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from frasi_api.audio import AudioValidationError, probe_audio
from frasi_api.config import get_settings
from frasi_api.database import get_session
from frasi_api.integrations import (
    IntegrationUnavailable,
    InvalidExternalUrl,
    fetch_spotify,
    fetch_youtube,
)
from frasi_api.models import AudioAsset, ExternalReference, Recording, SourceKind
from frasi_api.schemas.recordings import (
    ExternalRecordingCreate,
    RecordingDetail,
    RecordingResponse,
)
from frasi_api.security import CurrentUser
from frasi_api.storage import get_storage

router = APIRouter(prefix="/recordings", tags=["recordings"])
settings = get_settings()


async def persist_upload(
    file: UploadFile, owner_id: str, recording_id: str
) -> tuple[AudioAsset, float]:
    extension = Path(file.filename or "").suffix.lower()
    if extension not in {".wav", ".mp3", ".flac", ".m4a", ".ogg"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Unsupported audio format"
        )
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    digest = sha256()
    size = 0
    with NamedTemporaryFile(dir=settings.storage_root, suffix=extension, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        try:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_mb * 1024 * 1024:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Audio file is too large",
                    )
                digest.update(chunk)
                temporary.write(chunk)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
    try:
        info = probe_audio(temporary_path, extension)
        key = f"recordings/{owner_id}/{recording_id}/{uuid4()}{extension}"
        await get_storage(settings).put(temporary_path, key, info.media_type)
    except AudioValidationError as exc:
        temporary_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    asset = AudioAsset(
        recording_id=recording_id,
        kind="original",
        storage_key=key,
        media_type=info.media_type,
        size_bytes=size,
        sha256=digest.hexdigest(),
        sample_rate=info.sample_rate,
        channels=info.channels,
        duration_seconds=info.duration_seconds,
    )
    return asset, info.duration_seconds


@router.post("", response_model=RecordingDetail, status_code=status.HTTP_201_CREATED)
async def create_recording(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form(max_length=300)] = None,
    artist: Annotated[str | None, Form(max_length=300)] = None,
    album: Annotated[str | None, Form(max_length=300)] = None,
    year: Annotated[int | None, Form(ge=1900, le=2100)] = None,
) -> Recording:
    recording = Recording(
        owner_id=user.id,
        title=title or Path(file.filename or "Untitled recording").stem,
        artist=artist,
        album=album,
        year=year,
        duration_seconds=0,
        source_kind=SourceKind.UPLOAD,
    )
    session.add(recording)
    await session.flush()
    asset: AudioAsset | None = None
    try:
        asset, duration = await persist_upload(file, user.id, recording.id)
        recording.duration_seconds = duration
        session.add(asset)
        await session.commit()
    except Exception:
        await session.rollback()
        if asset is not None:
            await get_storage(settings).delete(asset.storage_key)
        raise
    await session.refresh(recording, attribute_names=["assets", "external_references"])
    return recording


@router.post("/external", response_model=RecordingDetail, status_code=status.HTTP_201_CREATED)
async def create_external_recording(
    payload: ExternalRecordingCreate,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Recording:
    provider = payload.provider.lower()
    try:
        if provider == "youtube":
            track = await fetch_youtube(str(payload.url), settings)
        elif provider == "spotify":
            track = await fetch_spotify(str(payload.url), settings)
        else:
            raise HTTPException(status_code=422, detail="Provider must be youtube or spotify")
    except InvalidExternalUrl as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except IntegrationUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    recording = Recording(
        owner_id=user.id,
        title=track.title,
        artist=track.artist,
        album=track.album,
        year=track.year,
        duration_seconds=track.duration_seconds,
        source_kind=track.provider,
        metadata_json={"licensed_playback_only": True},
    )
    recording.external_references.append(
        ExternalReference(
            provider=track.provider,
            provider_id=track.provider_id,
            canonical_url=track.canonical_url,
            embed_url=track.embed_url,
            metadata_json=track.metadata,
        )
    )
    session.add(recording)
    await session.commit()
    await session.refresh(recording, attribute_names=["assets", "external_references"])
    return recording


@router.post("/{recording_id}/audio", response_model=RecordingDetail, status_code=201)
async def attach_authorized_audio(
    recording_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File()],
) -> Recording:
    recording = await session.scalar(
        select(Recording)
        .options(selectinload(Recording.assets), selectinload(Recording.external_references))
        .where(Recording.id == recording_id)
    )
    if recording is None or recording.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Recording not found")
    if any(asset.kind == "original" for asset in recording.assets):
        raise HTTPException(status_code=409, detail="Recording already has authorized audio")
    asset: AudioAsset | None = None
    try:
        asset, duration = await persist_upload(file, user.id, recording.id)
        recording.duration_seconds = duration
        recording.assets.append(asset)
        await session.commit()
    except Exception:
        await session.rollback()
        if asset is not None:
            await get_storage(settings).delete(asset.storage_key)
        raise
    await session.refresh(recording, attribute_names=["assets", "external_references"])
    return recording


@router.get("", response_model=list[RecordingResponse])
async def list_recordings(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Recording]:
    result = await session.scalars(
        select(Recording)
        .where(Recording.owner_id == user.id)
        .order_by(Recording.created_at.desc())
        .limit(100)
    )
    return list(result)


@router.get("/{recording_id}", response_model=RecordingDetail)
async def get_recording(
    recording_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Recording:
    recording = await session.scalar(
        select(Recording)
        .options(selectinload(Recording.assets), selectinload(Recording.external_references))
        .where(Recording.id == recording_id)
    )
    if recording is None or recording.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recording not found")
    return recording
