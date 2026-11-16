import { formatJazzChordSuffix } from "@frasi/music-core";

export interface DemoMeasure {
  chord: string;
  notes: Array<{
    step: string;
    alter?: number;
    octave: number;
    duration: number;
    type: string;
  }>;
}

const phrase: DemoMeasure[] = [
  {
    chord: "Dm7",
    notes: [
      { step: "F", octave: 4, duration: 2, type: "quarter" },
      { step: "A", octave: 4, duration: 1, type: "eighth" },
      { step: "C", octave: 5, duration: 1, type: "eighth" },
      { step: "D", octave: 5, duration: 2, type: "quarter" },
      { step: "E", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "G7",
    notes: [
      { step: "F", octave: 5, duration: 1, type: "eighth" },
      { step: "D", octave: 5, duration: 1, type: "eighth" },
      { step: "B", octave: 4, duration: 2, type: "quarter" },
      { step: "A", octave: 4, duration: 1, type: "eighth" },
      { step: "B", octave: 4, duration: 1, type: "eighth" },
      { step: "D", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Cmaj7",
    notes: [
      { step: "E", octave: 5, duration: 2, type: "quarter" },
      { step: "G", octave: 5, duration: 1, type: "eighth" },
      { step: "F", octave: 5, duration: 1, type: "eighth" },
      { step: "E", octave: 5, duration: 2, type: "quarter" },
      { step: "D", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "C7",
    notes: [
      { step: "C", octave: 5, duration: 2, type: "quarter" },
      { step: "E", octave: 5, duration: 1, type: "eighth" },
      { step: "G", octave: 5, duration: 1, type: "eighth" },
      { step: "B", alter: -1, octave: 5, duration: 2, type: "quarter" },
      { step: "A", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Fmaj7",
    notes: [
      { step: "A", octave: 4, duration: 2, type: "quarter" },
      { step: "C", octave: 5, duration: 1, type: "eighth" },
      { step: "E", octave: 5, duration: 1, type: "eighth" },
      { step: "G", octave: 5, duration: 2, type: "quarter" },
      { step: "F", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Bb7",
    notes: [
      { step: "F", octave: 5, duration: 2, type: "quarter" },
      { step: "D", octave: 5, duration: 1, type: "eighth" },
      { step: "D", alter: -1, octave: 5, duration: 1, type: "eighth" },
      { step: "C", octave: 5, duration: 2, type: "quarter" },
      { step: "C", octave: 4, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Em7b5",
    notes: [
      { step: "G", octave: 4, duration: 2, type: "quarter" },
      { step: "B", alter: -1, octave: 4, duration: 1, type: "eighth" },
      { step: "D", octave: 5, duration: 1, type: "eighth" },
      { step: "F", octave: 5, duration: 2, type: "quarter" },
      { step: "E", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "A7alt",
    notes: [
      { step: "C", octave: 5, duration: 1, type: "eighth" },
      { step: "C", alter: 1, octave: 5, duration: 1, type: "eighth" },
      { step: "E", octave: 5, duration: 2, type: "quarter" },
      { step: "G", octave: 5, duration: 2, type: "quarter" },
      { step: "B", alter: -1, octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Dm7",
    notes: [
      { step: "A", octave: 5, duration: 2, type: "quarter" },
      { step: "F", octave: 5, duration: 1, type: "eighth" },
      { step: "E", octave: 5, duration: 1, type: "eighth" },
      { step: "D", octave: 5, duration: 2, type: "quarter" },
      { step: "C", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "G7",
    notes: [
      { step: "B", octave: 4, duration: 2, type: "quarter" },
      { step: "D", octave: 5, duration: 1, type: "eighth" },
      { step: "F", octave: 5, duration: 1, type: "eighth" },
      { step: "A", octave: 5, duration: 2, type: "quarter" },
      { step: "G", octave: 5, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Cmaj7",
    notes: [
      { step: "E", octave: 5, duration: 2, type: "quarter" },
      { step: "D", octave: 5, duration: 1, type: "eighth" },
      { step: "C", octave: 5, duration: 1, type: "eighth" },
      { step: "B", octave: 4, duration: 2, type: "quarter" },
      { step: "G", octave: 4, duration: 2, type: "quarter" },
    ],
  },
  {
    chord: "Bdim7",
    notes: [
      { step: "C", alter: 1, octave: 5, duration: 2, type: "quarter" },
      { step: "E", octave: 5, duration: 1, type: "eighth" },
      { step: "G", octave: 5, duration: 1, type: "eighth" },
      { step: "A", octave: 5, duration: 2, type: "quarter" },
      { step: "C", octave: 6, duration: 2, type: "quarter" },
    ],
  },
];

function harmony(symbol: string): string {
  const match = /^([A-G])([#b]?)(.*)$/.exec(symbol);
  const step = match?.[1] ?? "C";
  const accidental = match?.[2] === "#" ? 1 : match?.[2] === "b" ? -1 : 0;
  const suffix = match?.[3] ?? "";
  const normalized = suffix.replaceAll("△", "maj").replaceAll("°", "dim");
  const kind =
    normalized === "m7b5"
      ? "half-diminished"
      : normalized === "dim7"
        ? "diminished-seventh"
        : normalized === "dim"
          ? "diminished"
          : normalized === "maj7"
            ? "major-seventh"
            : normalized.startsWith("m")
              ? normalized.includes("7")
                ? "minor-seventh"
                : "minor"
              : normalized.startsWith("7")
                ? "dominant"
                : "major";
  return `<harmony><root><root-step>${step}</root-step>${accidental ? `<root-alter>${accidental}</root-alter>` : ""}</root><kind text="${formatJazzChordSuffix(suffix)}">${kind}</kind></harmony>`;
}

export function createDemoMusicXml(
  title = "Midnight Language — demo phrase",
): string {
  const measures = phrase
    .map((measure, index) => {
      const attributes =
        index === 0
          ? `<attributes><divisions>2</divisions><key><fifths>-1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>140</per-minute></metronome></direction-type><sound tempo="140"/></direction>`
          : "";
      const notes = measure.notes
        .map(
          (note) =>
            `<note><pitch><step>${note.step}</step>${note.alter ? `<alter>${note.alter}</alter>` : ""}<octave>${note.octave}</octave></pitch><duration>${note.duration}</duration><voice>1</voice><type>${note.type}</type>${note.duration === 1 ? '<beam number="1">continue</beam>' : ""}</note>`,
        )
        .join("");
      return `<measure number="${index + 1}">${attributes}${harmony(measure.chord)}${notes}</measure>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd"><score-partwise version="4.0"><work><work-title>${title}</work-title></work><identification><creator type="composer">Frasi demo data — not an AI result</creator></identification><part-list><score-part id="P1"><part-name>Tenor Saxophone</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export const DEMO_MUSIC_XML = createDemoMusicXml();
