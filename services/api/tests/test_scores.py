from pathlib import Path

from httpx import AsyncClient
from sqlalchemy import select
from test_recordings import register, wav_bytes

from frasi_api.database import get_session
from frasi_api.main import app
from frasi_api.models import (
    ChordEvent,
    Measure,
    NoteEvent,
    ScoreRevision,
    TempoEvent,
    TranscriptionProject,
    Voice,
)


async def create_seeded_score(
    client: AsyncClient, tmp_path: Path
) -> tuple[dict[str, str], str, str, str]:
    token = await register(client, "score-editor@example.com")
    headers = {"Authorization": f"Bearer {token}"}
    upload = await client.post(
        "/api/v1/recordings",
        headers=headers,
        files={"file": ("phrase.wav", wav_bytes(), "audio/wav")},
    )
    created = await client.post(
        "/api/v1/transcriptions",
        headers=headers,
        json={
            "recording_id": upload.json()["id"],
            "title": "Editable phrase",
            "instrument_id": "tenor_saxophone",
            "segment_start_seconds": 0,
            "segment_end_seconds": 0.2,
        },
    )
    project_id = created.json()["id"]

    override = app.dependency_overrides[get_session]
    generator = override()
    session = await anext(generator)
    try:
        project = await session.scalar(
            select(TranscriptionProject).where(TranscriptionProject.id == project_id)
        )
        assert project is not None
        revision = ScoreRevision(
            project_id=project.id,
            revision=1,
            source="transcription",
            musicxml="<score-partwise/>",
        )
        measure = Measure(number=1, beats=4, beat_type=4)
        voice = Voice(number=1)
        note = NoteEvent(
            concert_midi=60,
            spelling="C4",
            is_rest=False,
            performance_onset_seconds=0.123,
            performance_offset_seconds=0.62,
            pitch_confidence=0.9,
            onset_confidence=0.8,
            beat_numerator=0,
            beat_denominator=1,
            duration_numerator=1,
            duration_denominator=1,
        )
        chord = ChordEvent(
            beat_numerator=0,
            beat_denominator=1,
            symbol="Cm7",
            source="estimated",
            confidence=0.7,
        )
        voice.notes.append(note)
        measure.voices.append(voice)
        measure.chord_events.append(chord)
        revision.measures.append(measure)
        revision.tempo_events.append(
            TempoEvent(
                at_seconds=0,
                measure_number=1,
                beat_numerator=0,
                beat_denominator=1,
                bpm=120,
            )
        )
        session.add(revision)
        await session.flush()
        project.current_revision_id = revision.id
        await session.commit()
        return headers, project.id, revision.id, note.id
    finally:
        await generator.aclose()


async def test_score_edit_creates_revision_and_preserves_performance_time(
    client: AsyncClient, tmp_path: Path
) -> None:
    headers, project_id, revision_id, note_id = await create_seeded_score(client, tmp_path)
    response = await client.patch(
        f"/api/v1/transcriptions/{project_id}/score",
        headers=headers,
        json={
            "base_revision_id": revision_id,
            "edit_summary": "Corrected the opening pitch and harmony",
            "note_updates": [{"note_id": note_id, "concert_midi": 62, "spelling": "D4"}],
            "chord_updates": [
                {
                    "measure_number": 1,
                    "beat_numerator": 2,
                    "beat_denominator": 1,
                    "symbol": "G7",
                }
            ],
        },
    )
    assert response.status_code == 201, response.text
    score = response.json()
    assert score["revision"] == 2
    assert score["parent_revision_id"] == revision_id
    assert "<work-title>Editable phrase</work-title>" in score["musicxml"]
    assert "<root-step>G</root-step>" in score["musicxml"]
    assert '<kind text="7">dominant</kind>' in score["musicxml"]
    updated = score["measures"][0]["voices"][0]["notes"][0]
    assert updated["concert_midi"] == 62
    assert updated["performance_onset_seconds"] == 0.123

    stale = await client.patch(
        f"/api/v1/transcriptions/{project_id}/score",
        headers=headers,
        json={
            "base_revision_id": revision_id,
            "edit_summary": "Stale edit",
            "note_updates": [{"note_id": note_id, "concert_midi": 63}],
        },
    )
    assert stale.status_code == 409


async def test_score_is_private(client: AsyncClient, tmp_path: Path) -> None:
    _, project_id, _, _ = await create_seeded_score(client, tmp_path)
    other_token = await register(client, "score-other@example.com")
    response = await client.get(
        f"/api/v1/transcriptions/{project_id}/score",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
