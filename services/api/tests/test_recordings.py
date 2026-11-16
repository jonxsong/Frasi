import io
import math
import struct
import wave
from pathlib import Path

from httpx import AsyncClient

from frasi_api.api.recordings import settings


def wav_bytes(seconds: float = 0.25, sample_rate: int = 8000) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        frames = [
            struct.pack("<h", int(9000 * math.sin(2 * math.pi * 440 * index / sample_rate)))
            for index in range(int(seconds * sample_rate))
        ]
        audio.writeframes(b"".join(frames))
    return output.getvalue()


async def register(client: AsyncClient, email: str) -> str:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "correct-horse-battery-staple",
            "display_name": "Recording Tester",
        },
    )
    assert response.status_code == 201
    return response.json()["access_token"]


async def test_upload_validates_and_persists_audio(client: AsyncClient, tmp_path: Path) -> None:
    settings.storage_root = tmp_path
    token = await register(client, "owner@example.com")
    response = await client.post(
        "/api/v1/recordings",
        headers={"Authorization": f"Bearer {token}"},
        data={"title": "Authorized session", "artist": "Test Player", "year": "2026"},
        files={"file": ("session.wav", wav_bytes(), "audio/wav")},
    )
    assert response.status_code == 201, response.text
    recording = response.json()
    assert recording["title"] == "Authorized session"
    assert recording["duration_seconds"] == 0.25
    assert recording["assets"][0]["sample_rate"] == 8000
    assert len(list(tmp_path.rglob("*.wav"))) == 1

    listed = await client.get("/api/v1/recordings", headers={"Authorization": f"Bearer {token}"})
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [recording["id"]]

    other_token = await register(client, "other@example.com")
    private = await client.get(
        f"/api/v1/recordings/{recording['id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert private.status_code == 404


async def test_rejects_extension_spoofing(client: AsyncClient, tmp_path: Path) -> None:
    settings.storage_root = tmp_path
    token = await register(client, "spoof@example.com")
    response = await client.post(
        "/api/v1/recordings",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": ("not-audio.wav", b"this is not wave audio", "audio/wav")},
    )
    assert response.status_code == 422
    assert not list(tmp_path.rglob("*.wav"))
