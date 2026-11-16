// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildLocalMusicXml,
  detectPitch,
  estimateTempo,
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
    expect(xml).toContain("Real browser-side pitch analysis");
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
