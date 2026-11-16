from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from frasi_api.database import get_session
from frasi_api.models import PracticeSession, VocabularyPhrase
from frasi_api.schemas.practice import (
    PracticeCreate,
    PracticeResponse,
    PracticeSummary,
    VocabularyCreate,
    VocabularyPatch,
    VocabularyResponse,
)
from frasi_api.security import CurrentUser

from .scores import load_owned_revision, score_response
from .transcriptions import owned_project

router = APIRouter(tags=["practice"])


async def owned_phrase(session: AsyncSession, phrase_id: str, owner_id: str) -> VocabularyPhrase:
    phrase = await session.get(VocabularyPhrase, phrase_id)
    if phrase is None or phrase.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Phrase not found")
    return phrase


@router.post("/vocabulary", response_model=VocabularyResponse, status_code=201)
async def create_phrase(
    payload: VocabularyCreate,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VocabularyPhrase:
    project = await owned_project(session, payload.project_id, user.id)
    revision = await load_owned_revision(session, project, payload.revision_id)
    selected = [
        measure
        for measure in score_response(revision).measures
        if payload.start_measure <= measure.number <= payload.end_measure
    ]
    expected = payload.end_measure - payload.start_measure + 1
    if len(selected) != expected:
        raise HTTPException(status_code=422, detail="Phrase includes a missing measure")
    if payload.source_end_seconds > project.segment_end_seconds + 0.05:
        raise HTTPException(status_code=422, detail="Phrase timestamps exceed the source segment")
    values = payload.model_dump(exclude={"tags"})
    phrase = VocabularyPhrase(
        owner_id=user.id,
        original_key=project.concert_key,
        original_instrument_id=project.instrument_id,
        tags=payload.tags,
        score_snapshot={
            "revision": revision.revision,
            "measures": [measure.model_dump(mode="json") for measure in selected],
        },
        **values,
    )
    session.add(phrase)
    await session.commit()
    await session.refresh(phrase)
    return phrase


@router.get("/vocabulary", response_model=list[VocabularyResponse])
async def list_phrases(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[VocabularyPhrase]:
    phrases = await session.scalars(
        select(VocabularyPhrase)
        .where(VocabularyPhrase.owner_id == user.id)
        .order_by(VocabularyPhrase.updated_at.desc())
        .limit(200)
    )
    return list(phrases)


@router.get("/vocabulary/{phrase_id}", response_model=VocabularyResponse)
async def get_phrase(
    phrase_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VocabularyPhrase:
    return await owned_phrase(session, phrase_id, user.id)


@router.patch("/vocabulary/{phrase_id}", response_model=VocabularyResponse)
async def patch_phrase(
    phrase_id: str,
    payload: VocabularyPatch,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VocabularyPhrase:
    phrase = await owned_phrase(session, phrase_id, user.id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "tags" and value is not None:
            value = sorted({tag.strip().lower() for tag in value if tag.strip()})
        setattr(phrase, field, value)
    await session.commit()
    await session.refresh(phrase)
    return phrase


@router.delete("/vocabulary/{phrase_id}", status_code=204)
async def delete_phrase(
    phrase_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    phrase = await owned_phrase(session, phrase_id, user.id)
    await session.delete(phrase)
    await session.commit()
    return Response(status_code=204)


@router.post("/practice-sessions", response_model=PracticeResponse, status_code=201)
async def create_practice_session(
    payload: PracticeCreate,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PracticeSession:
    if payload.phrase_id is not None:
        await owned_phrase(session, payload.phrase_id, user.id)
    if payload.project_id is not None:
        await owned_project(session, payload.project_id, user.id)
    values = payload.model_dump(exclude={"completed"})
    practice = PracticeSession(
        owner_id=user.id,
        completed_at=datetime.now(UTC) if payload.completed else None,
        **values,
    )
    session.add(practice)
    await session.commit()
    await session.refresh(practice)
    return practice


@router.get("/practice-sessions", response_model=list[PracticeResponse])
async def list_practice_sessions(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[PracticeSession]:
    sessions = await session.scalars(
        select(PracticeSession)
        .where(PracticeSession.owner_id == user.id)
        .order_by(PracticeSession.created_at.desc())
        .limit(200)
    )
    return list(sessions)


@router.get("/practice-summary", response_model=PracticeSummary)
async def get_practice_summary(
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> PracticeSummary:
    sessions = list(
        await session.scalars(
            select(PracticeSession)
            .where(PracticeSession.owner_id == user.id)
            .order_by(PracticeSession.created_at.desc())
            .limit(500)
        )
    )
    return PracticeSummary(
        session_count=len(sessions),
        duration_seconds=sum(item.duration_seconds for item in sessions),
        practiced_keys=sorted({key for item in sessions for key in item.practiced_keys}),
        mastered_keys=sorted({key for item in sessions for key in item.mastered_keys}),
        recent_sessions=sessions[:10],
    )
