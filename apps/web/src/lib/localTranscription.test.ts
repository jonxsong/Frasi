// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildLocalMusicXml,
  detectPitch,
  estimateTempo,
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
});
