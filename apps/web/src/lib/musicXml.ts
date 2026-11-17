import { instruments, transposeChord } from "@frasi/music-core";
import type { InstrumentId } from "@frasi/shared-types";

const NATURAL: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const SHARPS = [
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
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FIFTHS: Record<string, number> = {
  C: 0,
  Db: -5,
  D: 2,
  Eb: -3,
  E: 4,
  F: -1,
  Gb: -6,
  G: 1,
  Ab: -4,
  A: 3,
  Bb: -2,
  B: 5,
};
const MAJOR_KEY_BY_FIFTHS: Record<number, string> = {
  [-7]: "Cb",
  [-6]: "Gb",
  [-5]: "Db",
  [-4]: "Ab",
  [-3]: "Eb",
  [-2]: "Bb",
  [-1]: "F",
  0: "C",
  1: "G",
  2: "D",
  3: "A",
  4: "E",
  5: "B",
  6: "F#",
  7: "C#",
};

function text(element: Element, selector: string): string | null {
  return element.querySelector(selector)?.textContent ?? null;
}

function setText(element: Element, selector: string, value: string) {
  const node = element.querySelector(selector);
  if (node) node.textContent = value;
}

function setOptionalNumber(parent: Element, tag: string, value: number) {
  const existing = parent.querySelector(tag);
  if (value === 0) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.textContent = String(value);
    return;
  }
  const node = parent.ownerDocument.createElement(tag);
  node.textContent = String(value);
  parent.insertBefore(node, parent.querySelector("octave"));
}

function splitSpelling(spelling: string): { step: string; alter: number } {
  return {
    step: spelling[0] ?? "C",
    alter: spelling.endsWith("#") ? 1 : spelling.endsWith("b") ? -1 : 0,
  };
}

export function transposeMusicXml(
  source: string,
  semitones: number,
  destinationKey: string,
): string {
  if (semitones === 0) return source;
  const document = new DOMParser().parseFromString(source, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("Invalid MusicXML document");
  const normalizedKey = destinationKey.replace(" (Original)", "");
  const names = normalizedKey.includes("b") ? FLATS : SHARPS;

  document.querySelectorAll("pitch").forEach((pitch) => {
    const step = text(pitch, "step") ?? "C";
    const alter = Number(text(pitch, "alter") ?? 0);
    const octave = Number(text(pitch, "octave") ?? 4);
    const midi = (octave + 1) * 12 + (NATURAL[step] ?? 0) + alter + semitones;
    const spelling = splitSpelling(names[((midi % 12) + 12) % 12] ?? "C");
    setText(pitch, "step", spelling.step);
    setOptionalNumber(pitch, "alter", spelling.alter);
    setText(pitch, "octave", String(Math.floor(midi / 12) - 1));
  });

  document.querySelectorAll("harmony").forEach((harmony) => {
    const root = harmony.querySelector("root");
    if (!root) return;
    const step = text(root, "root-step") ?? "C";
    const alter = Number(text(root, "root-alter") ?? 0);
    const pitchClass = ((NATURAL[step] ?? 0) + alter + semitones + 120) % 12;
    const spelling = splitSpelling(names[pitchClass] ?? "C");
    setText(root, "root-step", spelling.step);
    const existingAlter = root.querySelector("root-alter");
    if (spelling.alter === 0) existingAlter?.remove();
    else if (existingAlter) existingAlter.textContent = String(spelling.alter);
    else {
      const node = document.createElement("root-alter");
      node.textContent = String(spelling.alter);
      root.append(node);
    }
    const bass = harmony.querySelector("bass");
    if (bass) {
      const bassStep = text(bass, "bass-step") ?? "C";
      const bassAlter = Number(text(bass, "bass-alter") ?? 0);
      const bassPitchClass =
        ((NATURAL[bassStep] ?? 0) + bassAlter + semitones + 120) % 12;
      const bassSpelling = splitSpelling(names[bassPitchClass] ?? "C");
      setText(bass, "bass-step", bassSpelling.step);
      const existingBassAlter = bass.querySelector("bass-alter");
      if (bassSpelling.alter === 0) existingBassAlter?.remove();
      else if (existingBassAlter)
        existingBassAlter.textContent = String(bassSpelling.alter);
      else {
        const node = document.createElement("bass-alter");
        node.textContent = String(bassSpelling.alter);
        bass.append(node);
      }
    }
    const kind = harmony.querySelector("kind");
    const originalSymbol = kind?.getAttribute("text");
    if (kind && originalSymbol && /^[A-G][#b♯♭]?/.test(originalSymbol))
      kind.setAttribute(
        "text",
        transposeChord(originalSymbol, semitones, normalizedKey),
      );
  });

  if (normalizedKey in FIFTHS) {
    document.querySelectorAll("key > fifths").forEach((fifths) => {
      fifths.textContent = String(FIFTHS[normalizedKey]);
    });
  }

  return new XMLSerializer().serializeToString(document);
}

function destinationKeyForOffset(source: string, semitones: number): string {
  const document = new DOMParser().parseFromString(source, "application/xml");
  const sourceFifths = Number(
    document.querySelector("key > fifths")?.textContent ?? 0,
  );
  const sourceKey = MAJOR_KEY_BY_FIFTHS[sourceFifths] ?? "C";
  const sourcePitchClass =
    (NATURAL[sourceKey[0] ?? "C"] ?? 0) +
    (sourceKey.endsWith("#") ? 1 : sourceKey.endsWith("b") ? -1 : 0);
  const destinationPitchClass = (sourcePitchClass + semitones + 120) % 12;
  const preferFlats = sourceFifths < 0;
  return (preferFlats ? FLATS : SHARPS)[destinationPitchClass] ?? "C";
}

function pitchElementMidi(pitch: Element): number {
  const step = text(pitch, "step") ?? "C";
  const alter = Number(text(pitch, "alter") ?? 0);
  const octave = Number(text(pitch, "octave") ?? 4);
  return (octave + 1) * 12 + (NATURAL[step] ?? 0) + alter;
}

/**
 * Keep an otherwise conventional high tenor phrase in a readable staff
 * register. Canonical concert pitch stays untouched, and actual altissimo
 * notes remain in their detected octave.
 */
function normalizeTenorWrittenRegister(document: Document): void {
  const instrument = instruments.tenor_saxophone;
  const pitches = Array.from(document.querySelectorAll("note > pitch"));
  if (pitches.length < 3) return;
  const midi = pitches.map(pitchElementMidi);
  const sorted = [...midi].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const upperRegisterThreshold = instrument.standardHighestWrittenMidi - 14;
  const octaveDownPlayableShare =
    midi.filter((value) => value - 12 >= instrument.lowestWrittenMidi).length /
    midi.length;
  if (median < upperRegisterThreshold || octaveDownPlayableShare < 0.8) return;

  pitches.forEach((pitch, index) => {
    const original = midi[index] ?? 0;
    if (original > instrument.standardHighestWrittenMidi) return;
    if (original - 12 < instrument.lowestWrittenMidi) return;
    const octave = Number(text(pitch, "octave") ?? 4);
    setText(pitch, "octave", String(octave - 1));
  });
}

export function toWrittenPartMusicXml(
  source: string,
  instrumentId: InstrumentId,
  additionalSemitones = 0,
): string {
  const instrument = instruments[instrumentId];
  const keyIsUnanalysed = source.includes(
    '<miscellaneous-field name="key-analysis">unavailable</miscellaneous-field>',
  );
  const semitones = instrument.writtenOffsetSemitones + additionalSemitones;
  const destinationKey = destinationKeyForOffset(source, semitones);
  const written = transposeMusicXml(source, semitones, destinationKey);
  const document = new DOMParser().parseFromString(written, "application/xml");
  if (document.querySelector("parsererror"))
    throw new Error("Invalid MusicXML document");
  const partName = document.querySelector("score-part > part-name");
  if (partName) {
    partName.textContent =
      instrumentId === "tenor_saxophone"
        ? "Tenor Saxophone in B♭"
        : instrument.name;
  }
  if (instrumentId === "tenor_saxophone") {
    normalizeTenorWrittenRegister(document);
  }
  if (keyIsUnanalysed) {
    document.querySelectorAll("key > fifths").forEach((fifths) => {
      fifths.textContent = "0";
    });
  }
  return new XMLSerializer().serializeToString(document);
}
