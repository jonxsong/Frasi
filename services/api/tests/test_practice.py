from pathlib import Path

from httpx import AsyncClient
from test_recordings import register
from test_scores import create_seeded_score


async def test_vocabulary_and_practice_progress(client: AsyncClient, tmp_path: Path) -> None:
    headers, project_id, revision_id, _ = await create_seeded_score(client, tmp_path)
    created = await client.post(
        "/api/v1/vocabulary",
        headers=headers,
        json={
            "project_id": project_id,
            "revision_id": revision_id,
            "title": "Opening cell",
            "start_measure": 1,
            "end_measure": 1,
            "source_start_seconds": 0,
            "source_end_seconds": 0.2,
            "tags": ["II-V-I", "ii-v-i", "  Ballad "],
            "notes": "Move this through the cycle.",
        },
    )
    assert created.status_code == 201, created.text
    phrase = created.json()
    assert phrase["tags"] == ["ballad", "ii-v-i"]
    assert (
        phrase["score_snapshot"]["measures"][0]["voices"][0]["notes"][0][
            "performance_onset_seconds"
        ]
        == 0.123
    )

    practiced = await client.post(
        "/api/v1/practice-sessions",
        headers=headers,
        json={
            "phrase_id": phrase["id"],
            "project_id": project_id,
            "duration_seconds": 420,
            "tempo_bpm": 132,
            "practiced_keys": ["C", "Db", "D"],
            "mastered_keys": ["C"],
        },
    )
    assert practiced.status_code == 201, practiced.text
    assert practiced.json()["completed_at"] is not None

    summary = await client.get("/api/v1/practice-summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["duration_seconds"] == 420
    assert summary.json()["mastered_keys"] == ["C"]

    other = await register(client, "vocabulary-other@example.com")
    private = await client.get(
        f"/api/v1/vocabulary/{phrase['id']}",
        headers={"Authorization": f"Bearer {other}"},
    )
    assert private.status_code == 404


async def test_mastered_key_must_be_practiced(client: AsyncClient, tmp_path: Path) -> None:
    headers, project_id, _, _ = await create_seeded_score(client, tmp_path)
    response = await client.post(
        "/api/v1/practice-sessions",
        headers=headers,
        json={
            "project_id": project_id,
            "duration_seconds": 30,
            "tempo_bpm": 90,
            "practiced_keys": ["F"],
            "mastered_keys": ["Bb"],
        },
    )
    assert response.status_code == 422
