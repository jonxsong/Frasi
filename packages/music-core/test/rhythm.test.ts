import { describe, expect, it } from "vitest";
import type { NoteEvent } from "@frasi/shared-types";
import { quantizeDuration, rational, validateMeasureDurations } from "../src";

function note(id: string, duration: ReturnType<typeof rational>): NoteEvent {
  return {
    id,
    concertMidi: 60,
    spelling: "C4",
    performance: {
      onsetSeconds: 0,
      offsetSeconds: 0.5,
      detectedMidi: 60,
      pitchConfidence: 1,
      onsetConfidence: 1,
    },
    symbolic: { measure: 1, beat: rational(0), duration },
    voice: 1,
  };
}

describe("measure validation", () => {
  it("accepts exact 4/4 sums including tuplets", () => {
    const notes = [
      note("a", rational(1, 3)),
      note("b", rational(1, 3)),
      note("c", rational(1, 3)),
      note("d", rational(3)),
    ];
    expect(validateMeasureDurations(notes, 4, 4)).toEqual([]);
  });

  it("reports overfilled and underfilled voices", () => {
    expect(validateMeasureDurations([note("a", rational(3))], 4, 4)[0]?.kind).toBe(
      "underfilled",
    );
    expect(validateMeasureDurations([note("a", rational(5))], 4, 4)[0]?.kind).toBe(
      "overfilled",
    );
  });
});

describe("beat-aware duration quantization", () => {
  it("recognizes dotted and triplet values", () => {
    expect(quantizeDuration(0.75, 120).label).toBe("dotted-quarter");
    expect(quantizeDuration(1 / 3, 120).label).toBe("quarter-triplet");
  });

  it("does not force every ambiguous value to a triplet", () => {
    expect(quantizeDuration(0.26, 120).label).toBe("eighth");
  });
});
