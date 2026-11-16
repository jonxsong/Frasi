from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from frasi_api import __version__

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: datetime


@router.get("/health", response_model=HealthResponse, operation_id="health_check")
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="frasi-api",
        version=__version__,
        timestamp=datetime.now(UTC),
    )
