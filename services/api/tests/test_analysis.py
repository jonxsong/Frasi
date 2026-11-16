from pathlib import Path

from httpx import AsyncClient
from test_scores import create_seeded_score

from frasi_api.harmony import analyze_revision, parse_chord
from frasi_api.models import ChordEvent, Measure, NoteEvent, ScoreRevision, Voice


def test_detects_two_five_one_and_reports_scales() -> None:
    revision = ScoreRevision(
        project_id="project",
        revision=1,
        source="test",
        musicxml="<score-partwise/>",
    )
    for number, chord, pitch in ((1, "Dm7", 62), (2, "G7", 67), (3, "Cmaj7", 60)):
        measure = Measure(number=number, beats=4, beat_type=4)
        measure.chord_events.append(
            ChordEvent(
                beat_numerator=0,
                beat_denominator=1,
                symbol=chord,
                source="user",
                confidence=1,
            )
        )
        voice = Voice(number=1)
        voice.notes.append(
            NoteEvent(
                concert_midi=pitch,
                spelling=None,
                is_rest=False,
                performance_onset_seconds=number - 1,
                performance_offset_seconds=number,
                beat_numerator=0,
                beat_denominator=1,
                duration_numerator=4,
                duration_denominator=1,
            )
        )
        measure.voices.append(voice)
        revision.measures.append(measure)

    result = analyze_revision(revision)
    assert any("ii–V–I" in pattern for pattern in result.patterns)
    assert any("Dominant resolution" in pattern for pattern in result.patterns)
    assert result.chords[1].likely_scales[0].endswith("Mixolydian")
    assert "ground truth" in result.caveats[0]


async def test_analysis_endpoint_uses_owned_current_revision(
    client: AsyncClient, tmp_path: Path
) -> None:
    headers, project_id, _, _ = await create_seeded_score(client, tmp_path)
    response = await client.get(f"/api/v1/transcriptions/{project_id}/analysis", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["chords"][0]["symbol"] == "Cm7"
    assert body["chords"][0]["source"] == "estimated"
    assert body["chords"][0]["likely_scales"]


def test_unicode_jazz_chord_aliases_preserve_harmonic_quality() -> None:
    assert parse_chord("C△7") == (0, "major")
    assert parse_chord("B°7") == (11, "diminished")
    assert parse_chord("Eø7") == (4, "half-diminished")
