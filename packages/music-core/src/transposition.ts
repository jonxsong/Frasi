import type { ChordEvent, NoteEvent, ScoreDocument } from "@frasi/shared-types";

const SHARP_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const FLAT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];
const FLAT_KEYS = new Set([
  "F",
  "Bb",
  "Eb",
  "Ab",
  "Db",
  "Gb",
  "Cb",
  "Dm",
  "Gm",
  "Cm",
  "Fm",
  "Bbm",
  "Ebm",
]);
const NOTE_PATTERN = /^([A-G])([#b♯♭]?)(.*)$/;
const CHORD_PATTERN = /^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/;

function pitchClass(name: string): number {
  const match = NOTE_PATTERN.exec(name);
  if (!match) throw new Error(`Unsupported pitch spelling: ${name}`);
  const natural = ({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const)[
    match[1] as keyof typeof naturalPitchClasses
  ];
  const accidental =
    match[2] === "#" || match[2] === "♯"
      ? 1
      : match[2] === "b" || match[2] === "♭"
        ? -1
        : 0;
  return (natural + accidental + 12) % 12;
}

const naturalPitchClasses = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
} as const;

export function spellMidi(midi: number, key = "C"): string {
  const names = FLAT_KEYS.has(key) ? FLAT_NAMES : SHARP_NAMES;
  const pitch = names[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${pitch}${octave}`;
}

export function transposeChord(
  symbol: string,
  semitones: number,
  destinationKey = "C",
): string {
  const match = CHORD_PATTERN.exec(symbol);
  if (!match) return symbol;
  const names = FLAT_KEYS.has(destinationKey) ? FLAT_NAMES : SHARP_NAMES;
  const [
    ,
    letter = "C",
    accidental = "",
    suffix = "",
    bassLetter,
    bassAccidental = "",
  ] = match;
  const root = letter + accidental;
  const transposed = (pitchClass(root) + semitones + 120) % 12;
  const bass = bassLetter
    ? `/${names[(pitchClass(bassLetter + bassAccidental) + semitones + 120) % 12]}`
    : "";
  return `${names[transposed]}${suffix}${bass}`;
}

function transposeNote(
  note: NoteEvent,
  semitones: number,
  destinationKey: string,
): NoteEvent {
  const concertMidi = note.concertMidi + semitones;
  return {
    ...note,
    concertMidi,
    spelling: spellMidi(concertMidi, destinationKey),
  };
}

function transposeChordEvent(
  chord: ChordEvent,
  semitones: number,
  destinationKey: string,
): ChordEvent {
  return {
    ...chord,
    symbol: transposeChord(chord.symbol, semitones, destinationKey),
  };
}

export function transposeScore(
  score: ScoreDocument,
  semitones: number,
  destinationKey: string,
): ScoreDocument {
  return {
    ...score,
    concertKey: destinationKey,
    notes: score.notes.map((note) =>
      transposeNote(note, semitones, destinationKey),
    ),
    chords: score.chords.map((chord) =>
      transposeChordEvent(chord, semitones, destinationKey),
    ),
  };
}
