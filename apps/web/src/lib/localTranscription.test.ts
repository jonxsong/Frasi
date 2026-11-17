// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildLocalMusicXml,
  correctOctaveErrors,
  detectPitch,
  estimateTempo,
  estimateTempoFromCandidates,
  selectMelodicLine,
  type LocalNoteEvent,
} from "./localTranscription";

describe("guest transcription DSP", () => {
  it("detects concert A from an actual waveform frame", () => {
    const sampleRate = 11_025;
    const frame = Float32Array.from({ length: 2_048 }, (_, index) =>
      Math.sin((2 * Math.PI * 440 * index) / sampleRate),
    );
    const result = detectPitch(frame, sampleRate);
    expect(result).not.toBeNull();
    expect(result?.midi).toBeCloseTo(69, 0);
    expect(result?.confidence).toBeGreaterThan(0.8);
  });

  it("builds reviewable MusicXML with pitches that require ledger lines", () => {
    const notes: LocalNoteEvent[] = [
      { midi: 48, onsetSeconds: 0, offsetSeconds: 0.5, confidence: 0.9 },
      { midi: 84, onsetSeconds: 0.5, offsetSeconds: 1, confidence: 0.92 },
    ];
    const xml = buildLocalMusicXml(notes, 120, "Ledger test");
    expect(xml).toContain("<octave>3</octave>");
    expect(xml).toContain("<octave>6</octave>");
    expect(xml).toContain("Spotify Basic Pitch");
  });

  it("extracts a coherent lead line from overlapping pitch candidates", () => {
    const notes = selectMelodicLine([
      {
        pitchMidi: 48,
        startTimeSeconds: 0,
        durationSeconds: 0.5,
        amplitude: 0.3,
      },
      {
        pitchMidi: 72,
        startTimeSeconds: 0,
        durationSeconds: 0.45,
        amplitude: 0.92,
      },
      {
        pitchMidi: 50,
        startTimeSeconds: 0.5,
        durationSeconds: 0.5,
        amplitude: 0.32,
      },
      {
        pitchMidi: 74,
        startTimeSeconds: 0.5,
        durationSeconds: 0.45,
        amplitude: 0.88,
      },
    ]);

    expect(notes.map((note) => note.midi)).toEqual([72, 74]);
  });

  it("rejects bass candidates below the tenor saxophone concert range", () => {
    const notes = selectMelodicLine(
      [
        {
          pitchMidi: 37,
          startTimeSeconds: 0,
          durationSeconds: 0.5,
          amplitude: 0.99,
        },
        {
          pitchMidi: 58,
          startTimeSeconds: 0,
          durationSeconds: 0.5,
          amplitude: 0.72,
        },
        {
          pitchMidi: 43,
          startTimeSeconds: 0.5,
          durationSeconds: 0.5,
          amplitude: 0.98,
        },
        {
          pitchMidi: 60,
          startTimeSeconds: 0.5,
          durationSeconds: 0.5,
          amplitude: 0.74,
        },
      ],
      { instrumentId: "tenor_saxophone" },
    );

    expect(notes.map((note) => note.midi)).toEqual([58, 60]);
    expect(notes.every((note) => note.midi >= 44 && note.midi <= 76)).toBe(
      true,
    );
  });

  it("keeps tenor altissimo candidates above the conventional F-sharp ceiling", () => {
    const notes = selectMelodicLine(
      [
        {
          pitchMidi: 82,
          startTimeSeconds: 0,
          durationSeconds: 0.5,
          amplitude: 0.9,
        },
        {
          pitchMidi: 84,
          startTimeSeconds: 0.5,
          durationSeconds: 0.5,
          amplitude: 0.9,
        },
      ],
      { instrumentId: "tenor_saxophone" },
    );

    expect(notes.map((note) => note.midi)).toEqual([82, 84]);
  });

  it("does not pull a coherent phrase into a higher octave", () => {
    const notes: LocalNoteEvent[] = [60, 62, 64].map((midi, index) => ({
      midi,
      onsetSeconds: index * 0.5,
      offsetSeconds: index * 0.5 + 0.4,
      confidence: 0.9,
    }));
    expect(
      correctOctaveErrors(notes, 44, 113).map((note) => note.midi),
    ).toEqual([60, 62, 64]);
  });

  it("corrects only an isolated octave spike between nearby notes", () => {
    const notes: LocalNoteEvent[] = [60, 72, 62].map((midi, index) => ({
      midi,
      onsetSeconds: index * 0.25,
      offsetSeconds: index * 0.25 + 0.2,
      confidence: 0.9,
    }));
    expect(
      correctOctaveErrors(notes, 44, 113).map((note) => note.midi),
    ).toEqual([60, 60, 62]);
  });

  it("engraves beamed triplets with visible 3:2 notation", () => {
    const triplet = 1 / 6;
    const notes = [60, 62, 64].map((midi, index) => ({
      midi,
      onsetSeconds: index * triplet,
      offsetSeconds: (index + 1) * triplet,
      confidence: 0.9,
    }));

    const xml = buildLocalMusicXml(notes, 120, "Triplet test");
    expect(xml).toContain('<beam number="1">begin</beam>');
    expect(xml).toContain('<beam number="1">continue</beam>');
    expect(xml).toContain('<beam number="1">end</beam>');
    expect(xml).toContain("<actual-notes>3</actual-notes>");
    expect(xml).toContain(
      '<tuplet type="start" bracket="no" show-number="actual"/>',
    );
    expect(xml).toContain('<tuplet type="stop"/>');
  });

  it("estimates a practical tempo from note onsets", () => {
    const notes = Array.from({ length: 5 }, (_, index) => ({
      midi: 60 + index,
      onsetSeconds: index * 0.5,
      offsetSeconds: index * 0.5 + 0.4,
      confidence: 0.9,
    }));
    expect(estimateTempo(notes)).toBe(120);
  });

  it("estimates tempo from accompaniment-aligned candidate onsets", () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      pitchMidi: 58 + (index % 5),
      startTimeSeconds: index * (2 / 3),
      durationSeconds: 0.25,
      amplitude: 0.8,
    }));
    expect(estimateTempoFromCandidates(candidates)).toBeGreaterThanOrEqual(88);
    expect(estimateTempoFromCandidates(candidates)).toBeLessThanOrEqual(92);
  });
});
