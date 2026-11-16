import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from frasi_api.database import get_session
from frasi_api.exports import render_midi, render_pdf
from frasi_api.security import CurrentUser

from .scores import load_owned_revision
from .transcriptions import owned_project

router = APIRouter(tags=["exports"])


@router.get("/transcriptions/{project_id}/export/{export_format}")
async def export_score(
    project_id: str,
    export_format: Literal["musicxml", "midi", "pdf"],
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    revision_id: Annotated[str | None, Query()] = None,
) -> Response:
    project = await owned_project(session, project_id, user.id)
    selected = revision_id or project.current_revision_id
    if selected is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Score is not ready")
    revision = await load_owned_revision(session, project, selected)
    filename = re.sub(r"[^A-Za-z0-9_-]+", "-", project.title).strip("-") or "frasi-score"
    if export_format == "musicxml":
        content = revision.musicxml.encode("utf-8")
        media_type = "application/vnd.recordare.musicxml+xml"
        suffix = "musicxml"
    elif export_format == "midi":
        content = render_midi(revision, project.title)
        media_type = "audio/midi"
        suffix = "mid"
    else:
        content = render_pdf(revision, project.title)
        media_type = "application/pdf"
        suffix = "pdf"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}.{suffix}"'},
    )
