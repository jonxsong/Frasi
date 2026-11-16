import { describe, expect, it } from "vitest";
import type { ScoreDocument } from "@frasi/shared-types";
import { toWrittenMidi, transposeChord, transposeScore } from "../src";

const score: ScoreDocument = {
  id: "score-1",
  revision: 1,
  title: "Test phrase",
  concertKey: "C",
  timeSignature: { beats: 4, beatType: 4 },
  notes: [
    {
      id: "note-1",
      concertMidi: 60,
      spelling: "C4",
      performance: {
        onsetSeconds: 0,
        offsetSeconds: 0.5,
        detectedMidi: 60,
        pitchConfidence: 1,
        onsetConfidence: 1,
      },
      symbolic: {
        measure: 1,
        beat: { numerator: 0, denominator: 1 },
        duration: { numerator: 1, denominator: 1 },
      },
      voice: 1,
    },
  ],
  chords: [
    {
      id: "chord-1",
      measure: 1,
      beat: { numerator: 0, denominator: 1 },
      symbol: "Cmaj7",
      source: "manual",
      locked: true,
    },
  ],
  tempoMap: [],
  musicXml: "",
};

describe("instrument notation", () => {
  it("keeps concert pitch independent from written pitch", () => {
    expect(toWrittenMidi(60, "trumpet")).toBe(62);
    expect(toWrittenMidi(48, "tenor_saxophone")).toBe(62);
    expect(toWrittenMidi(39, "baritone_saxophone")).toBe(60);
    expect(toWrittenMidi(48, "trombone")).toBe(48);
  });
});

describe("practice transposition", () => {
  it("transposes notes and harmony without altering performance timing", () => {
    const moved = transposeScore(score, 2, "D");
    expect(moved.notes[0]?.concertMidi).toBe(62);
    expect(moved.notes[0]?.performance).toEqual(score.notes[0]?.performance);
    expect(moved.chords[0]?.symbol).toBe("Dmaj7");
    expect(moved.chords[0]?.locked).toBe(true);
  });

  it("uses flat spelling in flat keys", () => {
    expect(transposeChord("D7alt", 1, "Eb")).toBe("Eb7alt");
  });
});
