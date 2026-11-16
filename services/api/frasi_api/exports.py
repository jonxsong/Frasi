import math
import re
import struct
from fractions import Fraction
from io import BytesIO

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen.canvas import Canvas

from .chords import format_jazz_chord
from .models import ScoreRevision

TICKS_PER_QUARTER = 480


def _variable_length(value: int) -> bytes:
    buffer = value & 0x7F
    encoded = bytearray()
    while value := value >> 7:
        buffer <<= 8
        buffer |= (value & 0x7F) | 0x80
    while True:
        encoded.append(buffer & 0xFF)
        if buffer & 0x80:
            buffer >>= 8
        else:
            break
    return bytes(encoded)


def _meta(kind: int, data: bytes) -> bytes:
    return bytes((0xFF, kind)) + _variable_length(len(data)) + data


def render_midi(revision: ScoreRevision, title: str) -> bytes:
    events: list[tuple[int, int, bytes]] = []
    title_data = title.encode("utf-8")[:255]
    events.append((0, 0, _meta(0x03, title_data)))
    first_measure = min(revision.measures, key=lambda item: item.number)
    denominator_power = int(math.log2(first_measure.beat_type))
    events.append(
        (
            0,
            0,
            _meta(0x58, bytes((first_measure.beats, denominator_power, 24, 8))),
        )
    )
    measure_starts: dict[int, int] = {}
    cursor = 0
    for measure in sorted(revision.measures, key=lambda item: item.number):
        measure_starts[measure.number] = cursor
        cursor += round(measure.beats * 4 / measure.beat_type * TICKS_PER_QUARTER)
    for tempo in revision.tempo_events:
        tick = measure_starts.get(tempo.measure_number, 0) + round(
            tempo.beat_numerator / tempo.beat_denominator * TICKS_PER_QUARTER
        )
        micros = max(1, round(60_000_000 / tempo.bpm))
        events.append((tick, 0, _meta(0x51, micros.to_bytes(3, "big"))))
    for measure in revision.measures:
        start = measure_starts[measure.number]
        for chord in measure.chord_events:
            tick = start + round(chord.beat_numerator / chord.beat_denominator * TICKS_PER_QUARTER)
            events.append((tick, 0, _meta(0x06, chord.symbol.encode("utf-8")[:255])))
        for voice in measure.voices:
            for note in voice.notes:
                if note.is_rest or note.concert_midi is None:
                    continue
                onset = start + round(
                    note.beat_numerator / note.beat_denominator * TICKS_PER_QUARTER
                )
                duration = max(
                    1,
                    round(note.duration_numerator / note.duration_denominator * TICKS_PER_QUARTER),
                )
                pitch = max(0, min(127, note.concert_midi))
                events.append((onset, 2, bytes((0x90, pitch, 88))))
                events.append((onset + duration, 1, bytes((0x80, pitch, 0))))
    events.sort(key=lambda item: (item[0], item[1]))
    track = bytearray()
    previous = 0
    for tick, _, event in events:
        track.extend(_variable_length(tick - previous))
        track.extend(event)
        previous = tick
    track.extend(b"\x00\xff\x2f\x00")
    return (
        b"MThd"
        + struct.pack(">IHHH", 6, 0, 1, TICKS_PER_QUARTER)
        + b"MTrk"
        + struct.pack(">I", len(track))
        + bytes(track)
    )


def _diatonic_position(spelling: str | None, midi: int | None) -> int:
    if spelling:
        match = re.fullmatch(r"([A-G])(?:#|b)?(-?\d)", spelling)
        if match:
            step, octave = match.groups()
            return (int(octave) - 4) * 7 + "CDEFGAB".index(step) - 2
    value = midi if midi is not None else 64
    pitch_class = value % 12
    step_index = (0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6)[pitch_class]
    return (value // 12 - 1 - 4) * 7 + step_index - 2


def _ledger_positions(position: int) -> tuple[int, ...]:
    if position <= -2:
        lowest_line = position if position % 2 == 0 else position + 1
        return tuple(range(-2, lowest_line - 1, -2))
    if position >= 10:
        return tuple(range(10, position + 1, 2))
    return ()


def _draw_jazz_chord(canvas: Canvas, x: float, y: float, symbol: str) -> None:
    cursor = x
    canvas.saveState()
    canvas.setFont("Helvetica-Bold", 9)
    canvas.setLineWidth(0.8)
    for character in format_jazz_chord(symbol):
        if character == "△":
            path = canvas.beginPath()
            path.moveTo(cursor, y)
            path.lineTo(cursor + 4, y + 7)
            path.lineTo(cursor + 8, y)
            path.close()
            canvas.drawPath(path, fill=0, stroke=1)
            cursor += 10
        elif character in {"°", "ø"}:
            canvas.circle(cursor + 3, y + 5.5, 2.8, fill=0, stroke=1)
            if character == "ø":
                canvas.line(cursor, y + 2, cursor + 6, y + 9)
            cursor += 7
        elif character == "−":
            canvas.line(cursor, y + 4, cursor + 6, y + 4)
            cursor += 8
        else:
            printable = {"♭": "b", "♯": "#"}.get(character, character)
            canvas.drawString(cursor, y, printable)
            cursor += canvas.stringWidth(printable, "Helvetica-Bold", 9)
    canvas.restoreState()


def render_pdf(revision: ScoreRevision, title: str) -> bytes:
    output = BytesIO()
    width, height = letter
    canvas = Canvas(output, pagesize=letter, pageCompression=1)
    canvas.setTitle(title)
    canvas.setAuthor("Frasi Jazz Transcription Studio")
    measures = sorted(revision.measures, key=lambda item: item.number)
    systems = [measures[index : index + 4] for index in range(0, len(measures), 4)] or [[]]
    system_index = 0
    while system_index < len(systems):
        canvas.setFillColor(HexColor("#17131E"))
        canvas.setFont("Helvetica-Bold", 22)
        canvas.drawString(54, height - 54, title)
        canvas.setFont("Helvetica", 9)
        canvas.setFillColor(HexColor("#655E70"))
        canvas.drawRightString(width - 54, height - 52, f"Frasi • revision {revision.revision}")
        y = height - 120
        for _ in range(5):
            if system_index >= len(systems):
                break
            system = systems[system_index]
            left, right = 54.0, width - 54.0
            staff_gap = 8.0
            for line in range(5):
                canvas.setStrokeColor(HexColor("#37303F"))
                canvas.setLineWidth(0.55)
                canvas.line(left, y + line * staff_gap, right, y + line * staff_gap)
            measure_width = (right - left) / max(1, len(system))
            canvas.setFont("Helvetica", 8)
            for column, measure in enumerate(system):
                start_x = left + column * measure_width
                end_x = start_x + measure_width
                canvas.setStrokeColor(HexColor("#17131E"))
                canvas.line(start_x, y, start_x, y + staff_gap * 4)
                if column == len(system) - 1:
                    canvas.line(end_x, y, end_x, y + staff_gap * 4)
                canvas.setFillColor(HexColor("#655E70"))
                canvas.drawString(start_x + 3, y + 42, str(measure.number))
                for chord in measure.chord_events:
                    ratio = float(Fraction(chord.beat_numerator, chord.beat_denominator)) / max(
                        1, measure.beats * 4 / measure.beat_type
                    )
                    canvas.setFillColor(HexColor("#5F329B"))
                    canvas.setStrokeColor(HexColor("#5F329B"))
                    _draw_jazz_chord(
                        canvas,
                        start_x + 8 + ratio * (measure_width - 16),
                        y + 42,
                        chord.symbol,
                    )
                for voice in measure.voices:
                    for note in voice.notes:
                        ratio = float(Fraction(note.beat_numerator, note.beat_denominator)) / max(
                            1, measure.beats * 4 / measure.beat_type
                        )
                        x = start_x + 10 + ratio * (measure_width - 20)
                        if note.is_rest:
                            canvas.setFillColor(HexColor("#17131E"))
                            canvas.rect(x - 2, y + 17, 6, 3, fill=1, stroke=0)
                            continue
                        position = _diatonic_position(note.spelling, note.concert_midi)
                        note_y = y + position * staff_gap / 2
                        canvas.setStrokeColor(HexColor("#17131E"))
                        canvas.setLineWidth(0.65)
                        for ledger_position in _ledger_positions(position):
                            ledger_y = y + ledger_position * staff_gap / 2
                            canvas.line(x - 6.5, ledger_y, x + 7.5, ledger_y)
                        canvas.saveState()
                        canvas.setFillColor(HexColor("#17131E"))
                        canvas.translate(x, note_y)
                        canvas.rotate(-18)
                        canvas.ellipse(-4, -2.6, 4, 2.6, fill=1, stroke=0)
                        canvas.restoreState()
                        canvas.setStrokeColor(HexColor("#17131E"))
                        canvas.setLineWidth(0.8)
                        canvas.line(x + 3.5, note_y, x + 3.5, note_y + 22)
                        if note.spelling and ("#" in note.spelling or "b" in note.spelling):
                            canvas.setFont("Helvetica", 8)
                            canvas.drawRightString(
                                x - 5, note_y - 2, "#" if "#" in note.spelling else "b"
                            )
            y -= 110
            system_index += 1
        canvas.setFillColor(HexColor("#8B8493"))
        canvas.setFont("Helvetica", 7)
        canvas.drawString(54, 32, "Generated from editable symbolic notation by Frasi")
        canvas.drawRightString(width - 54, 32, str(canvas.getPageNumber()))
        canvas.showPage()
    canvas.save()
    return output.getvalue()
