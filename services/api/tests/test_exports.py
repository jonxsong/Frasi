from pathlib import Path

from httpx import AsyncClient
from test_scores import create_seeded_score


async def test_musicxml_midi_and_pdf_exports(client: AsyncClient, tmp_path: Path) -> None:
    headers, project_id, revision_id, note_id = await create_seeded_score(client, tmp_path)
    edit = await client.patch(
        f"/api/v1/transcriptions/{project_id}/score",
        headers=headers,
        json={
            "base_revision_id": revision_id,
            "edit_summary": "Prepare export",
            "note_updates": [{"note_id": note_id, "articulation": "accent"}],
        },
    )
    assert edit.status_code == 201

    musicxml = await client.get(
        f"/api/v1/transcriptions/{project_id}/export/musicxml", headers=headers
    )
    assert musicxml.status_code == 200
    assert musicxml.headers["content-type"].startswith("application/vnd.recordare.musicxml+xml")
    assert b"<score-partwise" in musicxml.content

    midi = await client.get(f"/api/v1/transcriptions/{project_id}/export/midi", headers=headers)
    assert midi.status_code == 200
    assert midi.content.startswith(b"MThd")
    assert b"MTrk" in midi.content

    pdf = await client.get(f"/api/v1/transcriptions/{project_id}/export/pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF-")
    assert len(pdf.content) > 1000
