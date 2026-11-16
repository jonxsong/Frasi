import type { NoteEvent, Rational } from "@frasi/shared-types";
import { add, compare, rational, toNumber } from "./rational";

export interface MeasureIssue {
  measure: number;
  voice: number;
  expected: Rational;
  actual: Rational;
  kind: "underfilled" | "overfilled";
}

export function measureCapacity(beats: number, beatType: number): Rational {
  return rational(beats * 4, beatType);
}

export function validateMeasureDurations(
  notes: NoteEvent[],
  beats: number,
  beatType: number,
): MeasureIssue[] {
  const totals = new Map<string, Rational>();
  for (const note of notes) {
    const key = `${note.symbolic.measure}:${note.voice}`;
    totals.set(key, add(totals.get(key) ?? rational(0), note.symbolic.duration));
  }

  const capacity = measureCapacity(beats, beatType);
  const issues: MeasureIssue[] = [];
  for (const [key, total] of totals) {
    const difference = compare(total, capacity);
    if (difference === 0) continue;
    const [measure, voice] = key.split(":").map(Number);
    issues.push({
      measure: measure ?? 0,
      voice: voice ?? 0,
      expected: capacity,
      actual: total,
      kind: difference < 0 ? "underfilled" : "overfilled",
    });
  }
  return issues;
}

export interface QuantizationCandidate {
  value: Rational;
  label: string;
  complexity: number;
}

const CANDIDATES: QuantizationCandidate[] = [
  { value: rational(4), label: "whole", complexity: 0 },
  { value: rational(3), label: "dotted-half", complexity: 1 },
  { value: rational(2), label: "half", complexity: 0 },
  { value: rational(3, 2), label: "dotted-quarter", complexity: 1 },
  { value: rational(1), label: "quarter", complexity: 0 },
  { value: rational(3, 4), label: "dotted-eighth", complexity: 1 },
  { value: rational(2, 3), label: "quarter-triplet", complexity: 2 },
  { value: rational(1, 2), label: "eighth", complexity: 0 },
  { value: rational(1, 3), label: "eighth-triplet", complexity: 2 },
  { value: rational(1, 4), label: "sixteenth", complexity: 0 },
];

export function quantizeDuration(
  durationSeconds: number,
  bpm: number,
  allowedErrorBeats = 0.18,
): QuantizationCandidate {
  if (!(durationSeconds > 0) || !(bpm > 0)) {
    throw new RangeError("Duration and BPM must both be positive");
  }
  const durationBeats = durationSeconds / (60 / bpm);
  const ranked = CANDIDATES.map((candidate) => ({
    candidate,
    error: Math.abs(toNumber(candidate.value) - durationBeats),
    cost: Math.abs(toNumber(candidate.value) - durationBeats) + candidate.complexity * 0.025,
  })).sort((left, right) => left.cost - right.cost);
  const best = ranked[0];
  if (!best || best.error > allowedErrorBeats) {
    return {
      value: rational(Math.max(1, Math.round(durationBeats * 4)), 4),
      label: "tied-grid-value",
      complexity: 3,
    };
  }
  return best.candidate;
}
