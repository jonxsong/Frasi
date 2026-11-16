import base64
import re
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from .config import Settings


class IntegrationUnavailable(RuntimeError):
    pass


class InvalidExternalUrl(ValueError):
    pass


@dataclass(frozen=True)
class ExternalTrack:
    provider: str
    provider_id: str
    canonical_url: str
    embed_url: str
    title: str
    artist: str | None
    album: str | None
    year: int | None
    duration_seconds: float
    metadata: dict[str, object]


def parse_youtube_id(url: str) -> str:
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if host in {"youtu.be", "www.youtu.be"}:
        video_id = parsed.path.strip("/").split("/")[0]
    elif host in {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}:
        if parsed.path == "/watch":
            match = re.search(r"(?:^|&)v=([^&]+)", parsed.query)
            video_id = match.group(1) if match else ""
        elif parsed.path.startswith(("/shorts/", "/embed/")):
            video_id = parsed.path.split("/")[2]
        else:
            video_id = ""
    else:
        video_id = ""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise InvalidExternalUrl("Enter a valid YouTube video URL")
    return video_id


def parse_spotify_id(url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname not in {"open.spotify.com", "www.open.spotify.com"}:
        raise InvalidExternalUrl("Enter a valid Spotify track URL")
    match = re.fullmatch(r"/track/([A-Za-z0-9]{22})/?", parsed.path)
    if not match:
        raise InvalidExternalUrl("Only Spotify track URLs are supported")
    return match.group(1)


def _youtube_duration(value: str) -> float:
    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", value)
    if not match:
        return 0
    hours, minutes, seconds = match.groups()
    return int(hours or 0) * 3600 + int(minutes or 0) * 60 + float(seconds or 0)


async def fetch_youtube(url: str, settings: Settings) -> ExternalTrack:
    video_id = parse_youtube_id(url)
    if not settings.youtube_api_key:
        raise IntegrationUnavailable("YouTube metadata is not configured")
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "snippet,contentDetails",
                "id": video_id,
                "key": settings.youtube_api_key,
            },
        )
    if response.status_code != 200:
        raise IntegrationUnavailable("YouTube metadata is temporarily unavailable")
    items = response.json().get("items", [])
    if not items:
        raise InvalidExternalUrl("YouTube video was not found or is unavailable")
    item = items[0]
    snippet = item["snippet"]
    published = snippet.get("publishedAt", "")
    return ExternalTrack(
        provider="youtube",
        provider_id=video_id,
        canonical_url=f"https://www.youtube.com/watch?v={video_id}",
        embed_url=f"https://www.youtube.com/embed/{video_id}",
        title=snippet["title"],
        artist=snippet.get("channelTitle"),
        album=None,
        year=int(published[:4]) if published[:4].isdigit() else None,
        duration_seconds=_youtube_duration(item["contentDetails"].get("duration", "")),
        metadata={"thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url")},
    )


async def fetch_spotify(url: str, settings: Settings) -> ExternalTrack:
    track_id = parse_spotify_id(url)
    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise IntegrationUnavailable("Spotify metadata is not configured")
    credentials = base64.b64encode(
        f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode()
    ).decode()
    async with httpx.AsyncClient(timeout=10) as client:
        token_response = await client.post(
            "https://accounts.spotify.com/api/token",
            headers={"Authorization": f"Basic {credentials}"},
            data={"grant_type": "client_credentials"},
        )
        if token_response.status_code != 200:
            raise IntegrationUnavailable("Spotify metadata is temporarily unavailable")
        token = token_response.json()["access_token"]
        response = await client.get(
            f"https://api.spotify.com/v1/tracks/{track_id}",
            headers={"Authorization": f"Bearer {token}"},
        )
    if response.status_code == 404:
        raise InvalidExternalUrl("Spotify track was not found")
    if response.status_code != 200:
        raise IntegrationUnavailable("Spotify metadata is temporarily unavailable")
    item = response.json()
    album = item.get("album", {})
    release_date = album.get("release_date", "")
    artists = ", ".join(artist["name"] for artist in item.get("artists", [])) or None
    return ExternalTrack(
        provider="spotify",
        provider_id=track_id,
        canonical_url=f"https://open.spotify.com/track/{track_id}",
        embed_url=f"https://open.spotify.com/embed/track/{track_id}",
        title=item["name"],
        artist=artists,
        album=album.get("name"),
        year=int(release_date[:4]) if release_date[:4].isdigit() else None,
        duration_seconds=item.get("duration_ms", 0) / 1000,
        metadata={
            "preview_url": item.get("preview_url"),
            "image": (album.get("images") or [{}])[0].get("url"),
        },
    )
