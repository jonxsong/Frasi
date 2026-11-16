from pathlib import Path

from httpx import AsyncClient
from pytest import MonkeyPatch
from test_recordings import register, wav_bytes

from frasi_api.api.recordings import settings


async def test_project_creation_is_private_and_jobs_are_idempotent(
    client: AsyncClient,
    tmp_path: Path,
    monkeypatch: MonkeyPatch,
) -> None:
    settings.storage_root = tmp_path
    token = await register(client, "project-owner@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    upload = await client.post(
        "/api/v1/recordings",
        headers=headers,
        files={"file": ("phrase.wav", wav_bytes(), "audio/wav")},
    )
    assert upload.status_code == 201

    created = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "recording_id": upload.json()["id"],
            "title": "Two-beat phrase",
            "instrument_id": "tenor_saxophone",
            "segment_start_seconds": 0,
            "segment_end_seconds": 0.2,
        },
    )
    assert created.status_code == 201, created.text
    project = created.json()

    dispatched: list[str] = []
    monkeypatch.setattr(
        "frasi_api.api.transcriptions.dispatch_job", lambda job_id: dispatched.append(job_id)
    )
    process_headers = {**headers, "Idempotency-Key": "test-run-0001"}
    first = await client.post(
        f"/api/v1/transcriptions/{project['id']}/process", headers=process_headers
    )
    second = await client.post(
        f"/api/v1/transcriptions/{project['id']}/process", headers=process_headers
    )
    assert first.status_code == 202
    assert second.status_code == 202
    assert first.json()["id"] == second.json()["id"]
    assert dispatched == [first.json()["id"]]

    other_token = await register(client, "project-other@example.com")
    private = await client.get(
        f"/api/v1/transcriptions/{project['id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert private.status_code == 404


async def test_rejects_segment_outside_recording(client: AsyncClient, tmp_path: Path) -> None:
    settings.storage_root = tmp_path
    token = await register(client, "bounds@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    upload = await client.post(
        "/api/v1/recordings",
        headers=headers,
        files={"file": ("phrase.wav", wav_bytes(), "audio/wav")},
    )
    response = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "recording_id": upload.json()["id"],
            "title": "Invalid bounds",
            "instrument_id": "tenor_saxophone",
            "segment_start_seconds": 0,
            "segment_end_seconds": 12,
        },
    )
    assert response.status_code == 422
