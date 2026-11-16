from pathlib import Path

from httpx import AsyncClient
from pytest import MonkeyPatch, raises
from test_recordings import register, wav_bytes

from frasi_api.integrations import (
    ExternalTrack,
    InvalidExternalUrl,
    parse_spotify_id,
    parse_youtube_id,
)


def test_official_url_parsing_rejects_lookalike_hosts() -> None:
    assert parse_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert parse_spotify_id("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC") == (
        "4uLU6hMCjMI75M1A2tKUQC"
    )
    with raises(InvalidExternalUrl):
        parse_youtube_id("https://youtube.example/watch?v=dQw4w9WgXcQ")
    with raises(InvalidExternalUrl):
        parse_spotify_id("https://open.spotify.com.example/track/4uLU6hMCjMI75M1A2tKUQC")


async def test_external_reference_requires_authorized_audio_before_transcription(
    client: AsyncClient, tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    async def fake_youtube(url: str, settings: object) -> ExternalTrack:
        del url, settings
        return ExternalTrack(
            provider="youtube",
            provider_id="dQw4w9WgXcQ",
            canonical_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            embed_url="https://www.youtube.com/embed/dQw4w9WgXcQ",
            title="Licensed reference",
            artist="Artist channel",
            album=None,
            year=2024,
            duration_seconds=212,
            metadata={"thumbnail": "https://example.test/image.jpg"},
        )

    monkeypatch.setattr("frasi_api.api.recordings.fetch_youtube", fake_youtube)
    token = await register(client, "external@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    created = await client.post(
        "/api/v1/recordings/external",
        headers=headers,
        json={
            "provider": "youtube",
            "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        },
    )
    assert created.status_code == 201, created.text
    recording = created.json()
    assert recording["assets"] == []
    assert recording["external_references"][0]["embed_url"].startswith(
        "https://www.youtube.com/embed/"
    )

    blocked = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "recording_id": recording["id"],
            "title": "Reference phrase",
            "instrument_id": "tenor_saxophone",
            "segment_start_seconds": 0,
            "segment_end_seconds": 0.2,
        },
    )
    assert blocked.status_code == 409
    assert "authorized" in blocked.json()["detail"]

    attached = await client.post(
        f"/api/v1/recordings/{recording['id']}/audio",
        headers=headers,
        files={"file": ("owned.wav", wav_bytes(), "audio/wav")},
    )
    assert attached.status_code == 201, attached.text
    assert len(attached.json()["assets"]) == 1

    allowed = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "recording_id": recording["id"],
            "title": "Reference phrase",
            "instrument_id": "tenor_saxophone",
            "segment_start_seconds": 0,
            "segment_end_seconds": 0.2,
        },
    )
    assert allowed.status_code == 201, allowed.text
