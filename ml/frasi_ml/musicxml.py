from fractions import Fraction
from io import BytesIO

from music21 import meter, note, stream, tempo

from .types import SymbolicNote


def _quarter_length(value: Fraction) -> float:
    return value.numerator / value.denominator


def create_musicxml(
    notes: list[SymbolicNote],
    bpm: float,
    *,
    title: str = "Frasi transcription",
    beats_per_measure: int = 4,
    beat_type: int = 4,
) -> str:
    score = stream.Score(id="frasi-score")
    score.metadata = None
    part = stream.Part(id="P1")
    part.partName = "Concert Pitch"
    part.append(tempo.MetronomeMark(number=bpm))
    part.append(meter.TimeSignature(f"{beats_per_measure}/{beat_type}"))
    by_measure: dict[int, list[SymbolicNote]] = {}
    for event in notes:
        by_measure.setdefault(event.measure, []).append(event)
    last_measure = max(by_measure, default=1)
    for number in range(1, last_measure + 1):
        measure = stream.Measure(number=number)
        cursor = Fraction(0)
        for event in sorted(by_measure.get(number, []), key=lambda item: item.beat):
            if event.beat > cursor:
                rest = note.Rest(quarterLength=_quarter_length(event.beat - cursor))
                measure.insert(_quarter_length(cursor), rest)
            musical_note = note.Note(
                event.concert_midi, quarterLength=_quarter_length(event.duration)
            )
            if event.tuplet:
                musical_note.duration.appendTuplet(
                    __import__("music21").duration.Tuplet(event.tuplet[0], event.tuplet[1])
                )
            measure.insert(_quarter_length(event.beat), musical_note)
            cursor = max(cursor, event.beat + event.duration)
        capacity = Fraction(beats_per_measure * 4, beat_type)
        if cursor < capacity:
            measure.insert(
                _quarter_length(cursor), note.Rest(quarterLength=_quarter_length(capacity - cursor))
            )
        part.append(measure)
    score.append(part)
    exporter = __import__("music21").musicxml.m21ToXml.GeneralObjectExporter(score)
    output = exporter.parse()
    if isinstance(output, bytes):
        return output.decode("utf-8")
    if isinstance(output, BytesIO):
        return output.getvalue().decode("utf-8")
    return str(output)
