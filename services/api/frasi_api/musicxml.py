import re
from fractions import Fraction
from xml.etree import ElementTree as ET

from .chords import parse_chord_notation
from .models import Measure, NoteEvent, TempoEvent

DIVISIONS = 480


def _pitch_components(note: NoteEvent) -> tuple[str, int, int]:
    spelling = note.spelling or ""
    match = re.fullmatch(r"([A-G])([#b]?)(-?\d)", spelling)
    if match:
        step, accidental, octave = match.groups()
        return step, {"#": 1, "b": -1, "": 0}[accidental], int(octave)
    midi = note.concert_midi if note.concert_midi is not None else 60
    names = (
        ("C", 0),
        ("C", 1),
        ("D", 0),
        ("D", 1),
        ("E", 0),
        ("F", 0),
        ("F", 1),
        ("G", 0),
        ("G", 1),
        ("A", 0),
        ("A", 1),
        ("B", 0),
    )
    step, alter = names[midi % 12]
    return step, alter, midi // 12 - 1


def _duration_ticks(note: NoteEvent) -> int:
    value = Fraction(note.duration_numerator, note.duration_denominator) * DIVISIONS
    return max(1, round(float(value)))


def _note_type(ticks: int) -> tuple[str, bool]:
    candidates = {
        1920: ("whole", False),
        1440: ("half", True),
        960: ("half", False),
        720: ("quarter", True),
        480: ("quarter", False),
        360: ("eighth", True),
        240: ("eighth", False),
        180: ("16th", True),
        120: ("16th", False),
        60: ("32nd", False),
    }
    return candidates.get(ticks, ("quarter", False))


def _append_harmony(parent: ET.Element, symbol: str, offset: int) -> None:
    notation = parse_chord_notation(symbol)
    if not notation:
        return
    harmony = ET.SubElement(parent, "harmony")
    root = ET.SubElement(harmony, "root")
    ET.SubElement(root, "root-step").text = notation.root_step
    if notation.root_alter:
        ET.SubElement(root, "root-alter").text = str(notation.root_alter)
    kind = ET.SubElement(harmony, "kind", text=notation.text)
    kind.text = notation.kind
    if notation.bass_step:
        bass = ET.SubElement(harmony, "bass")
        ET.SubElement(bass, "bass-step").text = notation.bass_step
        if notation.bass_alter:
            ET.SubElement(bass, "bass-alter").text = str(notation.bass_alter)
    if offset:
        ET.SubElement(harmony, "offset").text = str(offset)


def build_musicxml(
    *,
    title: str,
    measures: list[Measure],
    tempo_events: list[TempoEvent],
) -> str:
    score = ET.Element("score-partwise", version="4.0")
    work = ET.SubElement(score, "work")
    ET.SubElement(work, "work-title").text = title
    part_list = ET.SubElement(score, "part-list")
    score_part = ET.SubElement(part_list, "score-part", id="P1")
    ET.SubElement(score_part, "part-name").text = "Concert Pitch"
    part = ET.SubElement(score, "part", id="P1")
    tempo_by_measure = {item.measure_number: item for item in tempo_events}

    for model in sorted(measures, key=lambda item: item.number):
        measure = ET.SubElement(part, "measure", number=str(model.number))
        if model.number == 1:
            attributes = ET.SubElement(measure, "attributes")
            ET.SubElement(attributes, "divisions").text = str(DIVISIONS)
            time = ET.SubElement(attributes, "time")
            ET.SubElement(time, "beats").text = str(model.beats)
            ET.SubElement(time, "beat-type").text = str(model.beat_type)
            clef = ET.SubElement(attributes, "clef")
            ET.SubElement(clef, "sign").text = "G"
            ET.SubElement(clef, "line").text = "2"
        tempo = tempo_by_measure.get(model.number)
        if tempo:
            direction = ET.SubElement(measure, "direction", placement="above")
            direction_type = ET.SubElement(direction, "direction-type")
            metronome = ET.SubElement(direction_type, "metronome")
            ET.SubElement(metronome, "beat-unit").text = "quarter"
            ET.SubElement(metronome, "per-minute").text = f"{tempo.bpm:g}"
            ET.SubElement(direction, "sound", tempo=f"{tempo.bpm:g}")

        for chord in sorted(
            model.chord_events, key=lambda item: item.beat_numerator / item.beat_denominator
        ):
            offset = round(chord.beat_numerator / chord.beat_denominator * DIVISIONS)
            _append_harmony(measure, chord.symbol, offset)

        notes = [
            note
            for voice in sorted(model.voices, key=lambda item: item.number)
            for note in voice.notes
        ]
        notes.sort(key=lambda item: item.beat_numerator / item.beat_denominator)
        cursor = 0
        for model_note in notes:
            onset = round(model_note.beat_numerator / model_note.beat_denominator * DIVISIONS)
            if onset > cursor:
                forward = ET.SubElement(measure, "forward")
                ET.SubElement(forward, "duration").text = str(onset - cursor)
            note = ET.SubElement(measure, "note")
            if model_note.is_rest:
                ET.SubElement(note, "rest")
            else:
                pitch = ET.SubElement(note, "pitch")
                step, alter, octave = _pitch_components(model_note)
                ET.SubElement(pitch, "step").text = step
                if alter:
                    ET.SubElement(pitch, "alter").text = str(alter)
                ET.SubElement(pitch, "octave").text = str(octave)
            ticks = _duration_ticks(model_note)
            ET.SubElement(note, "duration").text = str(ticks)
            ET.SubElement(note, "voice").text = "1"
            value, dotted = _note_type(ticks)
            ET.SubElement(note, "type").text = value
            if dotted:
                ET.SubElement(note, "dot")
            if model_note.tuplet_actual and model_note.tuplet_normal:
                time_modification = ET.SubElement(note, "time-modification")
                ET.SubElement(time_modification, "actual-notes").text = str(
                    model_note.tuplet_actual
                )
                ET.SubElement(time_modification, "normal-notes").text = str(
                    model_note.tuplet_normal
                )
            if model_note.tie_stop:
                ET.SubElement(note, "tie", type="stop")
            if model_note.tie_start:
                ET.SubElement(note, "tie", type="start")
            if model_note.articulation:
                notations = ET.SubElement(note, "notations")
                articulations = ET.SubElement(notations, "articulations")
                ET.SubElement(articulations, model_note.articulation)
            cursor = max(cursor, onset + ticks)

    ET.indent(score)
    body = ET.tostring(score, encoding="unicode", xml_declaration=False)
    return '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + body
