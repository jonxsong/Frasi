import asyncio
from collections.abc import Awaitable
from datetime import UTC, datetime
from typing import Annotated, cast

import boto3
import redis.asyncio as redis
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from frasi_api import __version__
from frasi_api.config import get_settings
from frasi_api.database import get_session

router = APIRouter(tags=["health"])
settings = get_settings()


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    timestamp: datetime


@router.get("/health", response_model=HealthResponse, operation_id="health_check")
@router.get("/health/live", response_model=HealthResponse, include_in_schema=False)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="frasi-api",
        version=__version__,
        timestamp=datetime.now(UTC),
    )


@router.get("/health/ready", response_model=HealthResponse)
async def readiness(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> HealthResponse:
    try:
        await session.execute(text("SELECT 1"))
        redis_client = redis.from_url(
            settings.redis_url,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        try:
            await cast(Awaitable[bool], redis_client.ping())
        finally:
            await redis_client.aclose()
        if settings.storage_backend == "s3":
            client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                config=Config(s3={"addressing_style": "path"}),
                region_name="us-east-1",
            )
            await asyncio.to_thread(client.head_bucket, Bucket=settings.s3_bucket)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="A required dependency is unavailable",
        ) from exc
    return HealthResponse(
        status="ready",
        service="frasi-api",
        version=__version__,
        timestamp=datetime.now(UTC),
    )
