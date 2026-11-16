from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Annotated, Any
from uuid import uuid4

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .database import get_session
from .models import AuthSession, User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
settings = get_settings()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, encoded: str) -> bool:
    return password_hash.verify(password, encoded)


def token_hash(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()


def create_token(*, subject: str, token_type: str, expires_delta: timedelta, jti: str) -> str:
    now = datetime.now(UTC)
    claims: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "jti": jti,
        "iat": now,
        "exp": now + expires_delta,
        "iss": "frasi-api",
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, *, expected_type: str) -> dict[str, Any]:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer="frasi-api",
        )
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc
    if claims.get("type") != expected_type or not claims.get("sub") or not claims.get("jti"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    return claims


async def issue_token_pair(
    session: AsyncSession,
    user: User,
    request: Request,
) -> tuple[str, str]:
    jti = str(uuid4())
    access_token = create_token(
        subject=user.id,
        token_type="access",
        expires_delta=timedelta(minutes=settings.access_token_minutes),
        jti=str(uuid4()),
    )
    refresh_token = create_token(
        subject=user.id,
        token_type="refresh",
        expires_delta=timedelta(days=settings.refresh_token_days),
        jti=jti,
    )
    session.add(
        AuthSession(
            user_id=user.id,
            jti=jti,
            refresh_token_hash=token_hash(refresh_token),
            expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_days),
            user_agent=request.headers.get("user-agent"),
            ip_address=request.client.host if request.client else None,
        )
    )
    await session.commit()
    return access_token, refresh_token


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    claims = decode_token(credentials.credentials, expected_type="access")
    user = await session.get(User, claims["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is unavailable")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def rotate_refresh_token(
    token: str, session: AsyncSession, request: Request
) -> tuple[User, str, str]:
    claims = decode_token(token, expected_type="refresh")
    auth_session = await session.scalar(select(AuthSession).where(AuthSession.jti == claims["jti"]))
    now = datetime.now(UTC)
    if (
        auth_session is None
        or auth_session.revoked_at is not None
        or auth_session.expires_at.replace(tzinfo=UTC) <= now
        or auth_session.refresh_token_hash != token_hash(token)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked"
        )
    user = await session.get(User, claims["sub"])
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is unavailable")
    auth_session.revoked_at = now
    await session.flush()
    access_token, refresh_token = await issue_token_pair(session, user, request)
    return user, access_token, refresh_token
