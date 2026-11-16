from frasi_api.chords import format_jazz_chord, parse_chord_notation
from frasi_api.exports import _ledger_positions


def test_common_jazz_chords_have_semantic_musicxml_kinds() -> None:
    cases = {
        "Cmaj7": ("major-seventh", "△7", "C△7"),
        "Dm7": ("minor-seventh", "−7", "D−7"),
        "Em7b5": ("half-diminished", "ø7", "Eø7"),
        "Bdim7": ("diminished-seventh", "°7", "B°7"),
        "G7b9": ("dominant", "7♭9", "G7♭9"),
    }
    for source, (kind, text, formatted) in cases.items():
        notation = parse_chord_notation(source)
        assert notation is not None
        assert notation.kind == kind
        assert notation.text == text
        assert notation.formatted == formatted
        assert format_jazz_chord(source) == formatted


def test_slash_chord_encodes_bass_independently() -> None:
    notation = parse_chord_notation("Dbmaj7/F")
    assert notation is not None
    assert notation.root_step == "D"
    assert notation.root_alter == -1
    assert notation.bass_step == "F"
    assert notation.formatted == "D♭△7/F"


def test_ledger_lines_cover_notes_and_spaces_beyond_the_staff() -> None:
    assert _ledger_positions(-1) == ()
    assert _ledger_positions(-2) == (-2,)
    assert _ledger_positions(-3) == (-2,)
    assert _ledger_positions(-4) == (-2, -4)
    assert _ledger_positions(9) == ()
    assert _ledger_positions(10) == (10,)
    assert _ledger_positions(11) == (10,)
    assert _ledger_positions(12) == (10, 12)
