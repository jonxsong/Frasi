import re
from dataclasses import dataclass

CHORD_PATTERN = re.compile(r"^([A-G])([#b♯♭]?)(.*?)(?:/([A-G])([#b♯♭]?))?$")


@dataclass(frozen=True)
class ChordNotation:
    root_step: str
    root_alter: int
    suffix: str
    kind: str
    text: str
    quality: str
    bass_step: str | None = None
    bass_alter: int = 0

    @property
    def formatted(self) -> str:
        root = self.root_step + {1: "♯", -1: "♭", 0: ""}[self.root_alter]
        bass = (
            "/" + self.bass_step + {1: "♯", -1: "♭", 0: ""}[self.bass_alter]
            if self.bass_step
            else ""
        )
        return f"{root}{self.text}{bass}"


def _alteration_glyphs(value: str) -> str:
    return re.sub(r"b(?=\d)", "♭", re.sub(r"#(?=\d)", "♯", value))


def _suffix_notation(suffix: str) -> tuple[str, str, str]:
    value = (
        suffix.strip()
        .replace("♭", "b")
        .replace("♯", "#")
        .replace("Δ", "△")
        .replace("º", "°")
        .replace("Ø", "ø")
    )
    direct = {
        "": ("major", "△", "major"),
        "maj": ("major", "△", "major"),
        "M": ("major", "△", "major"),
        "△": ("major", "△", "major"),
        "maj7": ("major-seventh", "△7", "major"),
        "M7": ("major-seventh", "△7", "major"),
        "△7": ("major-seventh", "△7", "major"),
        "maj9": ("major-ninth", "△9", "major"),
        "M9": ("major-ninth", "△9", "major"),
        "△9": ("major-ninth", "△9", "major"),
        "maj13": ("major-13th", "△13", "major"),
        "M13": ("major-13th", "△13", "major"),
        "△13": ("major-13th", "△13", "major"),
        "m": ("minor", "−", "minor"),
        "min": ("minor", "−", "minor"),
        "-": ("minor", "−", "minor"),
        "−": ("minor", "−", "minor"),
        "m7": ("minor-seventh", "−7", "minor"),
        "min7": ("minor-seventh", "−7", "minor"),
        "-7": ("minor-seventh", "−7", "minor"),
        "−7": ("minor-seventh", "−7", "minor"),
        "m9": ("minor-ninth", "−9", "minor"),
        "m11": ("minor-11th", "−11", "minor"),
        "m13": ("minor-13th", "−13", "minor"),
        "mMaj7": ("major-minor", "−△7", "minor"),
        "mM7": ("major-minor", "−△7", "minor"),
        "m△7": ("major-minor", "−△7", "minor"),
        "m7b5": ("half-diminished", "ø7", "half-diminished"),
        "ø": ("half-diminished", "ø7", "half-diminished"),
        "ø7": ("half-diminished", "ø7", "half-diminished"),
        "dim": ("diminished", "°", "diminished"),
        "°": ("diminished", "°", "diminished"),
        "o": ("diminished", "°", "diminished"),
        "dim7": ("diminished-seventh", "°7", "diminished"),
        "°7": ("diminished-seventh", "°7", "diminished"),
        "o7": ("diminished-seventh", "°7", "diminished"),
        "aug": ("augmented", "+", "augmented"),
        "+": ("augmented", "+", "augmented"),
        "6": ("major-sixth", "6", "major"),
        "m6": ("minor-sixth", "−6", "minor"),
        "6/9": ("major-sixth", "6/9", "major"),
        "7": ("dominant", "7", "dominant"),
        "9": ("dominant-ninth", "9", "dominant"),
        "11": ("dominant-11th", "11", "dominant"),
        "13": ("dominant-13th", "13", "dominant"),
        "sus": ("suspended-fourth", "sus", "suspended"),
        "sus4": ("suspended-fourth", "sus", "suspended"),
        "7sus": ("suspended-fourth", "7sus", "suspended"),
        "7sus4": ("suspended-fourth", "7sus", "suspended"),
    }
    if value in direct:
        return direct[value]
    if value.startswith(("7", "9", "11", "13")):
        return "dominant", _alteration_glyphs(value), "dominant"
    if value.startswith(("m", "min", "-", "−")):
        tail = re.sub(r"^(?:min|m|-|−)", "", value)
        return "other", "−" + _alteration_glyphs(tail), "minor"
    if value.startswith(("maj", "M", "△")):
        tail = re.sub(r"^(?:maj|M|△)", "", value)
        return "other", "△" + _alteration_glyphs(tail), "major"
    return "other", _alteration_glyphs(value), "other"


def parse_chord_notation(symbol: str) -> ChordNotation | None:
    match = CHORD_PATTERN.fullmatch(symbol.strip())
    if not match:
        return None
    root_step, accidental, suffix, bass_step, bass_accidental = match.groups()
    kind, text, quality = _suffix_notation(suffix)
    accidentals = {"#": 1, "♯": 1, "b": -1, "♭": -1, "": 0}
    return ChordNotation(
        root_step=root_step,
        root_alter=accidentals[accidental],
        suffix=suffix,
        kind=kind,
        text=text,
        quality=quality,
        bass_step=bass_step,
        bass_alter=accidentals[bass_accidental or ""],
    )


def format_jazz_chord(symbol: str) -> str:
    notation = parse_chord_notation(symbol)
    return notation.formatted if notation else symbol
