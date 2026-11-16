import { transposeChord } from "@frasi/music-core";

const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARPS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const FIFTHS: Record<string, number> = { C: 0, Db: -5, D: 2, Eb: -3, E: 4, F: -1, Gb: -6, G: 1, Ab: -4, A: 3, Bb: -2, B: 5 };

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
  if (document.querySelector("parsererror")) throw new Error("Invalid MusicXML document");
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
    const kind = harmony.querySelector("kind");
    const originalSymbol = kind?.getAttribute("text");
    if (kind && originalSymbol) kind.setAttribute("text", transposeChord(originalSymbol, semitones, normalizedKey));
  });

  if (normalizedKey in FIFTHS) {
    document.querySelectorAll("key > fifths").forEach((fifths) => {
      fifths.textContent = String(FIFTHS[normalizedKey]);
    });
  }

  return new XMLSerializer().serializeToString(document);
}
