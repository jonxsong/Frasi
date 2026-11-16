from collections.abc import AsyncIterator

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from frasi_api import models  # noqa: F401
from frasi_api.database import Base, get_session
from frasi_api.main import app
from frasi_api.models import Instrument
from frasi_api.rate_limit import limiter


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    limiter.clear_memory()
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with session_factory() as seed_session:
        seed_session.add_all(
            [
                Instrument(
                    id="tenor_saxophone",
                    display_name="Tenor Saxophone",
                    transposition_semitones=14,
                    clef="treble",
                    minimum_concert_midi=44,
                    maximum_concert_midi=76,
                    enabled=True,
                ),
                Instrument(
                    id="trumpet",
                    display_name="B-flat Trumpet",
                    transposition_semitones=2,
                    clef="treble",
                    minimum_concert_midi=52,
                    maximum_concert_midi=82,
                    enabled=True,
                ),
            ]
        )
        await seed_session.commit()

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_session] = override_session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
        yield test_client
    app.dependency_overrides.clear()
    limiter.clear_memory()
    await engine.dispose()
