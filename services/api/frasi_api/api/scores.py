from fractions import Fraction
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from frasi_api.database import get_session
from frasi_api.models import (
    ChordEvent,
    Measure,
    NoteEvent,
    ScoreRevision,
    TempoEvent,
    TranscriptionProject,
    Voice,
)
from frasi_api.musicxml import build_musicxml
from frasi_api.schemas.scores import (
    ChordResponse,
    MeasureResponse,
    NoteResponse,
    ScorePatch,
    ScoreResponse,
    TempoResponse,
    VoiceResponse,
)
from frasi_api.security import CurrentUser

from .transcriptions import owned_project

router = APIRouter(tags=["scores"])


def revision_query(revision_id: str) -> Select[ScoreRevision]:
    return (
        select(ScoreRevision)
        .where(ScoreRevision.id == revision_id)
        .options(
            selectinload(ScoreRevision.measures)
            .selectinload(Measure.voices)
            .selectinload(Voice.notes),
            selectinload(ScoreRevision.measures).selectinload(Measure.chord_events),
            selectinload(ScoreRevision.tempo_events),
        )
    )


def score_response(revision: ScoreRevision) -> ScoreResponse:
    return ScoreResponse(
        id=revision.id,
        project_id=revision.project_id,
        parent_revision_id=revision.parent_revision_id,
        revision=revision.revision,
        source=revision.source,
        musicxml=revision.musicxml,
        edit_summary=revision.edit_summary,
        created_at=revision.created_at,
        measures=[
            MeasureResponse(
                number=measure.number,
                beats=measure.beats,
                beat_type=measure.beat_type,
                pickup=measure.pickup,
                voices=[
                    VoiceResponse(
                        number=voice.number,
                        notes=[
                            NoteResponse(
                                id=note.id,
                                concert_midi=note.concert_midi,
                                spelling=note.spelling,
                                is_rest=note.is_rest,
                                performance_onset_seconds=note.performance_onset_seconds,
                                performance_offset_seconds=note.performance_offset_seconds,
                                pitch_confidence=note.pitch_confidence,
                                onset_confidence=note.onset_confidence,
                                beat_numerator=note.beat_numerator,
                                beat_denominator=note.beat_denominator,
                                duration_numerator=note.duration_numerator,
                                duration_denominator=note.duration_denominator,
                                tuplet_actual=note.tuplet_actual,
                                tuplet_normal=note.tuplet_normal,
                                tie_start=note.tie_start,
                                tie_stop=note.tie_stop,
                                articulation=note.articulation,
                            )
                            for note in sorted(
                                voice.notes,
                                key=lambda item: item.beat_numerator / item.beat_denominator,
                            )
                        ],
                    )
                    for voice in sorted(measure.voices, key=lambda item: item.number)
                ],
                chords=[
                    ChordResponse(
                        id=chord.id,
                        beat_numerator=chord.beat_numerator,
                        beat_denominator=chord.beat_denominator,
                        symbol=chord.symbol,
                        source=chord.source,
                        confidence=chord.confidence,
                        locked=chord.locked,
                    )
                    for chord in sorted(
                        measure.chord_events,
                        key=lambda item: item.beat_numerator / item.beat_denominator,
                    )
                ],
            )
            for measure in sorted(revision.measures, key=lambda item: item.number)
        ],
        tempo_map=[
            TempoResponse(
                at_seconds=tempo.at_seconds,
                measure_number=tempo.measure_number,
                beat_numerator=tempo.beat_numerator,
                beat_denominator=tempo.beat_denominator,
                bpm=tempo.bpm,
            )
            for tempo in sorted(revision.tempo_events, key=lambda item: item.at_seconds)
        ],
    )


async def load_owned_revision(
    session: AsyncSession,
    project: TranscriptionProject,
    revision_id: str,
) -> ScoreRevision:
    revision = await session.scalar(revision_query(revision_id))
    if revision is None or revision.project_id != project.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Score revision not found"
        )
    return revision


@router.get("/transcriptions/{project_id}/score", response_model=ScoreResponse)
async def get_score(
    project_id: str,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
    revision_id: Annotated[str | None, Query()] = None,
) -> ScoreResponse:
    project = await owned_project(session, project_id, user.id)
    selected = revision_id or project.current_revision_id
    if selected is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Score is not ready")
    return score_response(await load_owned_revision(session, project, selected))


def _copy_note(note: NoteEvent, updates: dict[str, Any]) -> NoteEvent:
    values = {
        column.name: getattr(note, column.name)
        for column in NoteEvent.__table__.columns
        if column.name not in {"id", "voice_id"}
    }
    values.update(updates)
    if values["articulation"] == "":
        values["articulation"] = None
    if not values["is_rest"] and values["concert_midi"] is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A pitched note requires concert_midi",
        )
    return NoteEvent(**values)


def _validate_measure_notes(measure: Measure, voices: list[Voice]) -> None:
    measure_length = Fraction(measure.beats * 4, measure.beat_type)
    for voice in voices:
        spans: list[tuple[Fraction, Fraction]] = []
        for note in voice.notes:
            start = Fraction(note.beat_numerator, note.beat_denominator)
            end = start + Fraction(note.duration_numerator, note.duration_denominator)
            if start >= measure_length or end > measure_length:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"A note exceeds measure {measure.number}",
                )
            if any(
                start < previous_end and end > previous_start
                for previous_start, previous_end in spans
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Overlapping notes in measure {measure.number}",
                )
            spans.append((start, end))


@router.patch(
    "/transcriptions/{project_id}/score",
    response_model=ScoreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def patch_score(
    project_id: str,
    payload: ScorePatch,
    user: CurrentUser,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ScoreResponse:
    project = await owned_project(session, project_id, user.id)
    if project.current_revision_id != payload.base_revision_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The score changed; reload before applying edits",
        )
    base = await load_owned_revision(session, project, payload.base_revision_id)
    note_updates = {item.note_id: item for item in payload.note_updates}
    if len(note_updates) != len(payload.note_updates):
        raise HTTPException(status_code=422, detail="Duplicate note update")
    known_note_ids = {
        note.id for measure in base.measures for voice in measure.voices for note in voice.notes
    }
    unknown_notes = note_updates.keys() - known_note_ids
    if unknown_notes:
        raise HTTPException(status_code=422, detail="A note does not belong to this revision")

    latest = await session.scalar(
        select(func.max(ScoreRevision.revision)).where(ScoreRevision.project_id == project.id)
    )
    revision = ScoreRevision(
        project_id=project.id,
        parent_revision_id=base.id,
        revision=(latest or 0) + 1,
        source="user_edit",
        musicxml="",
        edit_summary=payload.edit_summary,
    )
    session.add(revision)

    old_to_new_measures: dict[int, Measure] = {}
    old_chords: dict[str, ChordEvent] = {}
    for measure in sorted(base.measures, key=lambda item: item.number):
        new_measure = Measure(
            number=measure.number,
            beats=measure.beats,
            beat_type=measure.beat_type,
            pickup=measure.pickup,
        )
        revision.measures.append(new_measure)
        old_to_new_measures[measure.number] = new_measure
        for voice in sorted(measure.voices, key=lambda item: item.number):
            new_voice = Voice(number=voice.number)
            new_measure.voices.append(new_voice)
            for note in voice.notes:
                note_update = note_updates.get(note.id)
                values = (
                    note_update.model_dump(exclude={"note_id"}, exclude_unset=True)
                    if note_update is not None
                    else {}
                )
                new_voice.notes.append(_copy_note(note, values))
        _validate_measure_notes(new_measure, new_measure.voices)
        for chord in measure.chord_events:
            old_chords[chord.id] = chord

    chord_updates_by_id = {
        update.chord_id: update for update in payload.chord_updates if update.chord_id is not None
    }
    if len(chord_updates_by_id) != sum(
        update.chord_id is not None for update in payload.chord_updates
    ):
        raise HTTPException(status_code=422, detail="Duplicate chord update")
    if chord_updates_by_id.keys() - old_chords.keys():
        raise HTTPException(status_code=422, detail="A chord does not belong to this revision")

    for chord_id, chord in old_chords.items():
        chord_update = chord_updates_by_id.get(chord_id)
        if chord_update is not None and chord_update.delete:
            continue
        target_measure = chord_update.measure_number if chord_update else chord.measure.number
        destination = old_to_new_measures.get(target_measure)
        if destination is None:
            raise HTTPException(status_code=422, detail="Chord measure does not exist")
        destination.chord_events.append(
            ChordEvent(
                beat_numerator=(
                    chord_update.beat_numerator if chord_update else chord.beat_numerator
                ),
                beat_denominator=(
                    chord_update.beat_denominator if chord_update else chord.beat_denominator
                ),
                symbol=(chord_update.symbol or chord.symbol) if chord_update else chord.symbol,
                source="user" if chord_update else chord.source,
                confidence=1.0 if chord_update else chord.confidence,
                locked=bool(chord_update) or chord.locked,
            )
        )
    for new_chord_update in (item for item in payload.chord_updates if item.chord_id is None):
        destination = old_to_new_measures.get(new_chord_update.measure_number)
        if destination is None:
            raise HTTPException(status_code=422, detail="Chord measure does not exist")
        destination.chord_events.append(
            ChordEvent(
                beat_numerator=new_chord_update.beat_numerator,
                beat_denominator=new_chord_update.beat_denominator,
                symbol=new_chord_update.symbol or "",
                source="user",
                confidence=1.0,
                locked=True,
            )
        )

    for tempo in base.tempo_events:
        revision.tempo_events.append(
            TempoEvent(
                at_seconds=tempo.at_seconds,
                measure_number=tempo.measure_number,
                beat_numerator=tempo.beat_numerator,
                beat_denominator=tempo.beat_denominator,
                bpm=tempo.bpm,
            )
        )
    revision.musicxml = build_musicxml(
        title=project.title,
        measures=revision.measures,
        tempo_events=revision.tempo_events,
    )
    await session.flush()
    project.current_revision_id = revision.id
    await session.commit()
    return score_response(await load_owned_revision(session, project, revision.id))
