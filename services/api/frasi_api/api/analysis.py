from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from frasi_api.database import get_session
from frasi_api.harmony import analyze_revision
from frasi_api.schemas.analysis import HarmonyResponse
from frasi_api.security import CurrentUser

from .scores import load_owned_revision
from .transcriptions import owned_project

router = APIRouter(tags=["analysis"])


@router.get("/transcriptions/{project_id}/analysis", response_model=HarmonyResponse)
async def get_analysis(
    project_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    revision_id: Annotated[str | None, Query()] = None,
) -> HarmonyResponse:
    project = await owned_project(session, project_id, user.id)
    selected = revision_id or project.current_revision_id
    if selected is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Score is not ready")
    revision = await load_owned_revision(session, project, selected)
    analysis = analyze_revision(revision)
    return HarmonyResponse(
        revision_id=revision.id,
        key=analysis.key,
        mode=analysis.mode,
        key_confidence=analysis.key_confidence,
        chords=[item.__dict__ for item in analysis.chords],
        patterns=list(analysis.patterns),
        caveats=list(analysis.caveats),
    )
