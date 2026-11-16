import { concertRange, conventionalConcertRange } from "@frasi/music-core";
import type { InstrumentId } from "@frasi/shared-types";

export interface LocalNoteEvent {
  midi: number;
  onsetSeconds: number;
  offsetSeconds: number;
  confidence: number;
}

export interface PitchEstimate {
  midi: number;
  confidence: number;
}

const MODEL_SAMPLE_RATE = 22_050;
const MODEL_CHUNK_SECONDS = 30;
const MODEL_CHUNK_OVERLAP_SECONDS = 0.75;
const DIVISIONS = 12;
const MEASURE_TICKS = DIVISIONS * 4;
const STRAIGHT_TICK_CANDIDATES = [3, 6, 9, 12, 18, 24, 36, 48];
const TRIPLET_TICK_CANDIDATES = [3, 4, 6, 8, 9, 12, 18, 24, 36, 48];
const PITCH_NAMES = [
  ["C", 0],
  ["C", 1],
  ["D", 0],
  ["D", 1],
  ["E", 0],
  ["F", 0],
  ["F", 1],
  ["G", 0],
  ["G", 1],
  ["A", 0],
  ["A", 1],
  ["B", 0],
] as const;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? (ordered[middle] ?? 0)
    : ((ordered[middle - 1] ?? 0) + (ordered[middle] ?? 0)) / 2;
}

function nearestTick(beats: number, allowTriplet = false): number {
  const raw = Math.max(0.25, beats) * DIVISIONS;
  const candidates = allowTriplet
    ? TRIPLET_TICK_CANDIDATES
    : STRAIGHT_TICK_CANDIDATES;
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - raw) < Math.abs(best - raw) ? candidate : best,
  );
}

function noteType(ticks: number): {
  type: string;
  dotted?: boolean;
  actual?: number;
  normal?: number;
} {
  const values: Record<
    number,
    { type: string; dotted?: boolean; actual?: number; normal?: number }
  > = {
    3: { type: "16th" },
    4: { type: "eighth", actual: 3, normal: 2 },
    6: { type: "eighth" },
    8: { type: "quarter", actual: 3, normal: 2 },
    9: { type: "eighth", dotted: true },
    12: { type: "quarter" },
    18: { type: "quarter", dotted: true },
    24: { type: "half" },
    36: { type: "half", dotted: true },
    48: { type: "whole" },
  };
  return values[ticks] ?? { type: "quarter" };
}

function pitchXml(midi: number): string {
  const [step, alter] = PITCH_NAMES[((midi % 12) + 12) % 12] ?? ["C", 0];
  const octave = Math.floor(midi / 12) - 1;
  return `<pitch><step>${step}</step>${alter ? `<alter>${alter}</alter>` : ""}<octave>${octave}</octave></pitch>`;
}

/** Normalized autocorrelation pitch estimate for a monophonic frame. */
export function detectPitch(
  frame: Float32Array,
  sampleRate: number,
): PitchEstimate | null {
  let mean = 0;
  for (const sample of frame) mean += sample;
  mean /= frame.length;
  let energy = 0;
  for (const sample of frame) energy += (sample - mean) ** 2;
  const rms = Math.sqrt(energy / frame.length);
  if (rms < 0.008) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / 1_200));
  const maxLag = Math.min(frame.length - 2, Math.ceil(sampleRate / 75));
  let bestLag = 0;
  let bestCorrelation = -1;
  const correlations = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let product = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = 0; index < frame.length - lag; index += 2) {
      const left = (frame[index] ?? 0) - mean;
      const right = (frame[index + lag] ?? 0) - mean;
      product += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const correlation =
      product / Math.sqrt(Math.max(Number.EPSILON, leftEnergy * rightEnergy));
    correlations[lag] = correlation;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  if (bestCorrelation < 0.58 || !bestLag) return null;

  const before = correlations[bestLag - 1] ?? bestCorrelation;
  const after = correlations[bestLag + 1] ?? bestCorrelation;
  const denominator = before - 2 * bestCorrelation + after;
  const adjustment = denominator ? (0.5 * (before - after)) / denominator : 0;
  const frequency =
    sampleRate / (bestLag + Math.max(-0.5, Math.min(0.5, adjustment)));
  const midi = 69 + 12 * Math.log2(frequency / 440);
  if (!Number.isFinite(midi) || midi < 24 || midi > 108) return null;
  return { midi, confidence: Math.min(1, Math.max(0, bestCorrelation)) };
}

function downmixAndResampleSelection(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
): Float32Array {
  const sourceStart = Math.floor(startSeconds * buffer.sampleRate);
  const sourceEnd = Math.min(
    buffer.length,
    Math.ceil(endSeconds * buffer.sampleRate),
  );
  const ratio = buffer.sampleRate / MODEL_SAMPLE_RATE;
  const output = new Float32Array(
    Math.max(1, Math.floor((sourceEnd - sourceStart) / ratio)),
  );
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  for (let target = 0; target < output.length; target += 1) {
    const sourcePosition = sourceStart + target * ratio;
    const left = Math.floor(sourcePosition);
    const right = Math.min(sourceEnd - 1, left + 1);
    const mix = sourcePosition - left;
    let value = 0;
    for (const channel of channels) {
      const leftSample = channel[left] ?? 0;
      const rightSample = channel[right] ?? leftSample;
      value += leftSample + (rightSample - leftSample) * mix;
    }
    output[target] = channels.length ? value / channels.length : 0;
  }
  return output;
}

export interface ModelNoteEvent {
  startTimeSeconds: number;
  durationSeconds: number;
  pitchMidi: number;
  amplitude: number;
}

interface BasicPitchRuntime {
  engine: {
    evaluateModel: (
      audio: Float32Array,
      onComplete: (
        frames: number[][],
        onsets: number[][],
        contours: number[][],
      ) => void,
      onProgress: (progress: number) => void,
    ) => Promise<void>;
  };
  outputToNotesPoly: (
    frames: number[][],
    onsets: number[][],
    onsetThreshold?: number,
    frameThreshold?: number,
    minimumNoteLength?: number,
  ) => Array<{
    startFrame: number;
    durationFrames: number;
    pitchMidi: number;
    amplitude: number;
  }>;
  noteFramesToTime: (
    notes: Array<{
      startFrame: number;
      durationFrames: number;
      pitchMidi: number;
      amplitude: number;
    }>,
  ) => ModelNoteEvent[];
}

let basicPitchRuntime: Promise<BasicPitchRuntime> | null = null;

async function getBasicPitchRuntime(): Promise<BasicPitchRuntime> {
  basicPitchRuntime ??= import("@spotify/basic-pitch").then((module) => ({
    engine: new module.BasicPitch("/models/basic-pitch/model.json"),
    outputToNotesPoly: module.outputToNotesPoly,
    noteFramesToTime: module.noteFramesToTime,
  }));
  return basicPitchRuntime;
}

function clusterByOnset(notes: ModelNoteEvent[]): ModelNoteEvent[][] {
  const clusters: ModelNoteEvent[][] = [];
  for (const note of [...notes].sort(
    (left, right) => left.startTimeSeconds - right.startTimeSeconds,
  )) {
    const cluster = clusters.at(-1);
    if (
      cluster &&
      note.startTimeSeconds - (cluster[0]?.startTimeSeconds ?? 0) <= 0.075
    ) {
      cluster.push(note);
    } else {
      clusters.push([note]);
    }
  }
  return clusters;
}

export interface MelodySelectionOptions {
  instrumentId?: InstrumentId;
  minimumMidi?: number;
  maximumMidi?: number;
  preferredMinimumMidi?: number;
}

function removeMelodicOutliers(notes: LocalNoteEvent[]): LocalNoteEvent[] {
  if (notes.length < 3) return notes;
  return notes.filter((note, index) => {
    const previous = notes[index - 1];
    const next = notes[index + 1];
    if (!previous || !next) return true;
    const incomingLeap = Math.abs(note.midi - previous.midi);
    const outgoingLeap = Math.abs(next.midi - note.midi);
    const surroundingMotion = Math.abs(next.midi - previous.midi);
    const duration = note.offsetSeconds - note.onsetSeconds;
    return !(
      incomingLeap >= 8 &&
      outgoingLeap >= 8 &&
      surroundingMotion <= 5 &&
      duration <= 0.65
    );
  });
}

function correctOctaveErrors(
  notes: LocalNoteEvent[],
  minimumMidi: number,
  maximumMidi: number,
): LocalNoteEvent[] {
  if (notes.length < 2) return notes;
  const candidates = notes.map((note) =>
    [note.midi, note.midi - 12, note.midi + 12]
      .filter(
        (midi, index, values) =>
          midi >= minimumMidi &&
          midi <= maximumMidi &&
          values.indexOf(midi) === index,
      )
      .map((midi) => ({
        midi,
        shiftCost: midi === note.midi ? 0 : 0.58,
      })),
  );
  const costs: number[][] = [];
  const previous: number[][] = [];
  candidates.forEach((choices, noteIndex) => {
    costs[noteIndex] = [];
    previous[noteIndex] = [];
    choices.forEach((choice, choiceIndex) => {
      if (noteIndex === 0) {
        costs[noteIndex]![choiceIndex] = choice.shiftCost;
        previous[noteIndex]![choiceIndex] = -1;
        return;
      }
      let bestCost = Number.POSITIVE_INFINITY;
      let bestPrevious = 0;
      (candidates[noteIndex - 1] ?? []).forEach(
        (previousChoice, previousIndex) => {
          const leap = Math.abs(choice.midi - previousChoice.midi);
          const transitionCost = leap * 0.035 + Math.max(0, leap - 7) * 0.22;
          const cost =
            (costs[noteIndex - 1]?.[previousIndex] ?? 0) +
            choice.shiftCost +
            transitionCost;
          if (cost < bestCost) {
            bestCost = cost;
            bestPrevious = previousIndex;
          }
        },
      );
      costs[noteIndex]![choiceIndex] = bestCost;
      previous[noteIndex]![choiceIndex] = bestPrevious;
    });
  });
  let selected = (costs.at(-1) ?? []).reduce(
    (best, cost, index, values) =>
      cost < (values[best] ?? Number.POSITIVE_INFINITY) ? index : best,
    0,
  );
  const corrected = [...notes];
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const choice = candidates[index]?.[selected];
    const note = corrected[index];
    if (choice && note) corrected[index] = { ...note, midi: choice.midi };
    selected = previous[index]?.[selected] ?? 0;
  }
  return corrected;
}

/** Select one coherent, instrument-aware lead line from polyphonic candidates. */
export function selectMelodicLine(
  notes: ModelNoteEvent[],
  options: MelodySelectionOptions = {},
): LocalNoteEvent[] {
  const range = options.instrumentId
    ? concertRange(options.instrumentId)
    : { minimum: 36, maximum: 100 };
  const minimumMidi = options.minimumMidi ?? range.minimum;
  const maximumMidi = options.maximumMidi ?? range.maximum;
  const conventionalRange = options.instrumentId
    ? conventionalConcertRange(options.instrumentId)
    : { minimum: minimumMidi, maximum: maximumMidi };
  const preferredMinimumMidi =
    options.preferredMinimumMidi ??
    Math.min(
      maximumMidi,
      minimumMidi +
        Math.max(
          8,
          (conventionalRange.maximum - conventionalRange.minimum) * 0.35,
        ),
    );
  const clusters = clusterByOnset(
    notes.filter(
      (note) =>
        note.pitchMidi >= minimumMidi &&
        note.pitchMidi <= maximumMidi &&
        note.durationSeconds >= 0.045 &&
        note.amplitude >= 0.18,
    ),
  );
  if (!clusters.length) return [];

  const scores: number[][] = [];
  const previousIndexes: number[][] = [];
  const silenceIndexes: number[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const candidates = [...cluster, null];
    const silenceIndex = candidates.length - 1;
    silenceIndexes[clusterIndex] = silenceIndex;
    scores[clusterIndex] = Array(candidates.length).fill(
      Number.NEGATIVE_INFINITY,
    );
    previousIndexes[clusterIndex] = Array(candidates.length).fill(-1);

    if (clusterIndex === 0) {
      scores[clusterIndex]![silenceIndex] = 0;
    } else {
      const previousScores = scores[clusterIndex - 1] ?? [];
      let bestPreviousIndex = 0;
      previousScores.forEach((score, index) => {
        if (score > (previousScores[bestPreviousIndex] ?? -Infinity))
          bestPreviousIndex = index;
      });
      scores[clusterIndex]![silenceIndex] =
        (previousScores[bestPreviousIndex] ?? 0) - 0.015;
      previousIndexes[clusterIndex]![silenceIndex] = bestPreviousIndex;
    }

    const hasConventionalCandidate = cluster.some(
      (candidate) => candidate.pitchMidi <= conventionalRange.maximum,
    );
    cluster.forEach((note, noteIndex) => {
      const lowRegisterPenalty =
        note.pitchMidi < preferredMinimumMidi
          ? (preferredMinimumMidi - note.pitchMidi) * 0.13
          : 0;
      // Prefer the conventional register over simultaneous overtones without
      // rejecting an altissimo-only onset or passage.
      const altissimoPenalty =
        note.pitchMidi > conventionalRange.maximum
          ? (note.pitchMidi - conventionalRange.maximum) *
            (hasConventionalCandidate ? 0.18 : 0.012)
          : 0;
      const registerEvidence =
        Math.min(
          1.2,
          (note.pitchMidi - minimumMidi) /
            Math.max(1, conventionalRange.maximum - minimumMidi),
        ) * 0.55;
      const evidence =
        note.amplitude * 1.55 +
        Math.min(1.2, note.durationSeconds) * 0.28 +
        registerEvidence -
        lowRegisterPenalty -
        altissimoPenalty -
        0.72;
      if (clusterIndex === 0) {
        scores[clusterIndex]![noteIndex] = evidence;
        previousIndexes[clusterIndex]![noteIndex] = -1;
        return;
      }
      let bestScore = Number.NEGATIVE_INFINITY;
      let bestPrevious = 0;
      const previousCluster = clusters[clusterIndex - 1] ?? [];
      previousCluster.forEach((previous, previousIndex) => {
        const leapPenalty =
          Math.min(24, Math.abs(note.pitchMidi - previous.pitchMidi)) * 0.065;
        const previousEnd =
          previous.startTimeSeconds + previous.durationSeconds;
        const overlapPenalty =
          Math.max(0, previousEnd - note.startTimeSeconds) * 0.45;
        const gapPenalty =
          Math.max(0, note.startTimeSeconds - previousEnd - 1.25) * 0.08;
        const score =
          (scores[clusterIndex - 1]?.[previousIndex] ?? 0) +
          evidence -
          leapPenalty -
          overlapPenalty -
          gapPenalty;
        if (score > bestScore) {
          bestScore = score;
          bestPrevious = previousIndex;
        }
      });
      const previousSilenceIndex = silenceIndexes[clusterIndex - 1] ?? 0;
      const fromSilence =
        (scores[clusterIndex - 1]?.[previousSilenceIndex] ?? 0) +
        evidence -
        0.08;
      if (fromSilence > bestScore) {
        bestScore = fromSilence;
        bestPrevious = previousSilenceIndex;
      }
      scores[clusterIndex]![noteIndex] = bestScore;
      previousIndexes[clusterIndex]![noteIndex] = bestPrevious;
    });
  });

  let selectedIndex = (scores.at(-1) ?? []).reduce(
    (best, score, index, values) =>
      score > (values[best] ?? -Infinity) ? index : best,
    0,
  );
  const selected: ModelNoteEvent[] = [];
  for (
    let clusterIndex = clusters.length - 1;
    clusterIndex >= 0;
    clusterIndex -= 1
  ) {
    const note = clusters[clusterIndex]?.[selectedIndex];
    if (note) selected.push(note);
    selectedIndex = previousIndexes[clusterIndex]?.[selectedIndex] ?? 0;
  }
  selected.reverse();

  const line: LocalNoteEvent[] = [];
  for (const note of selected) {
    const current: LocalNoteEvent = {
      midi: Math.round(note.pitchMidi),
      onsetSeconds: note.startTimeSeconds,
      offsetSeconds: note.startTimeSeconds + note.durationSeconds,
      confidence: note.amplitude,
    };
    const previous = line.at(-1);
    if (
      previous &&
      previous.midi === current.midi &&
      current.onsetSeconds - previous.offsetSeconds < 0.08
    ) {
      previous.offsetSeconds = Math.max(
        previous.offsetSeconds,
        current.offsetSeconds,
      );
      previous.confidence = Math.max(previous.confidence, current.confidence);
      continue;
    }
    if (previous && current.onsetSeconds < previous.offsetSeconds) {
      if (
        current.offsetSeconds <= previous.offsetSeconds &&
        current.confidence < previous.confidence * 1.1
      ) {
        continue;
      }
      previous.offsetSeconds = Math.max(
        previous.onsetSeconds + 0.045,
        current.onsetSeconds,
      );
    }
    line.push(current);
  }
  return removeMelodicOutliers(
    correctOctaveErrors(line, minimumMidi, maximumMidi),
  );
}

async function transcribeWithBasicPitch(
  audio: Float32Array,
  onProgress: (progress: number) => void,
): Promise<ModelNoteEvent[]> {
  const runtime = await getBasicPitchRuntime();
  const chunkSamples = Math.floor(MODEL_CHUNK_SECONDS * MODEL_SAMPLE_RATE);
  const overlapSamples = Math.floor(
    MODEL_CHUNK_OVERLAP_SECONDS * MODEL_SAMPLE_RATE,
  );
  const stride = chunkSamples - overlapSamples;
  const output: ModelNoteEvent[] = [];
  const chunkCount = Math.max(
    1,
    Math.ceil((audio.length - overlapSamples) / stride),
  );

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const startSample = chunkIndex * stride;
    const endSample = Math.min(audio.length, startSample + chunkSamples);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await runtime.engine.evaluateModel(
      audio.slice(startSample, endSample),
      (nextFrames, nextOnsets) => {
        frames.push(...nextFrames);
        onsets.push(...nextOnsets);
      },
      (chunkProgress) =>
        onProgress((chunkIndex + chunkProgress) / Math.max(1, chunkCount)),
    );
    const offsetSeconds = startSample / MODEL_SAMPLE_RATE;
    const isFirst = chunkIndex === 0;
    const isLast = endSample >= audio.length;
    const keepStart = isFirst ? 0 : MODEL_CHUNK_OVERLAP_SECONDS / 2;
    const keepEnd = isLast
      ? Number.POSITIVE_INFINITY
      : (endSample - startSample) / MODEL_SAMPLE_RATE -
        MODEL_CHUNK_OVERLAP_SECONDS / 2;
    const chunkNotes = runtime.noteFramesToTime(
      runtime.outputToNotesPoly(frames, onsets, 0.5, 0.3, 5),
    );
    for (const note of chunkNotes) {
      const center = note.startTimeSeconds + note.durationSeconds / 2;
      if (center < keepStart || center >= keepEnd) continue;
      output.push({
        ...note,
        startTimeSeconds: note.startTimeSeconds + offsetSeconds,
      });
    }
  }
  return output;
}

export function estimateTempo(notes: LocalNoteEvent[]): number {
  const intervals = notes
    .slice(1)
    .map((note, index) => note.onsetSeconds - (notes[index]?.onsetSeconds ?? 0))
    .filter((value) => value >= 0.14 && value <= 1.5);
  if (!intervals.length) return 120;
  let beatSeconds = median(intervals);
  while (beatSeconds < 0.34) beatSeconds *= 2;
  while (beatSeconds > 0.86) beatSeconds /= 2;
  return Math.max(70, Math.min(180, Math.round(60 / beatSeconds)));
}

export function estimateTempoFromCandidates(notes: ModelNoteEvent[]): number {
  if (notes.length < 4) return 120;
  const binSeconds = 0.02;
  const duration = Math.max(
    ...notes.map((note) => note.startTimeSeconds + note.durationSeconds),
  );
  const impulses = new Float32Array(Math.ceil(duration / binSeconds) + 1);
  for (const note of notes) {
    if (note.amplitude < 0.2) continue;
    const index = Math.round(note.startTimeSeconds / binSeconds);
    impulses[index] = Math.max(impulses[index] ?? 0, note.amplitude);
  }
  const envelope = new Float32Array(impulses.length);
  for (let index = 0; index < impulses.length; index += 1) {
    envelope[index] =
      (impulses[index - 2] ?? 0) * 0.15 +
      (impulses[index - 1] ?? 0) * 0.55 +
      (impulses[index] ?? 0) +
      (impulses[index + 1] ?? 0) * 0.55 +
      (impulses[index + 2] ?? 0) * 0.15;
  }

  function correlation(lag: number): number {
    let product = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = envelope[index] ?? 0;
      const right = envelope[index - lag] ?? 0;
      product += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    return product / Math.sqrt(Math.max(1e-9, leftEnergy * rightEnergy));
  }

  const scores = new Map<number, number>();
  for (let bpm = 60; bpm <= 180; bpm += 1) {
    const lag = Math.max(1, Math.round(60 / bpm / binSeconds));
    const score =
      correlation(lag) +
      correlation(lag * 2) * 0.62 +
      correlation(lag * 3) * 0.28;
    scores.set(bpm, score);
  }
  let best = 120;
  for (const [bpm, score] of scores) {
    if (score > (scores.get(best) ?? -Infinity)) best = bpm;
  }
  if (best > 135) {
    const half = Math.round(best / 2);
    if ((scores.get(half) ?? 0) >= (scores.get(best) ?? 0) * 0.68) best = half;
  }
  return best;
}

interface SymbolicItem {
  midi: number | null;
  ticks: number;
  tieStart?: boolean;
  tieStop?: boolean;
  beams?: Array<"begin" | "continue" | "end">;
  tuplet?: "start" | "stop";
  tupletBracket?: boolean;
}

function tripletNoteIndexes(notes: LocalNoteEvent[], bpm: number): Set<number> {
  const beatSeconds = 60 / bpm;
  const indexes = new Set<number>();
  for (let index = 0; index <= notes.length - 3; index += 1) {
    const first = notes[index];
    const second = notes[index + 1];
    const third = notes[index + 2];
    if (!first || !second || !third) continue;
    const firstGap = second.onsetSeconds - first.onsetSeconds;
    const secondGap = third.onsetSeconds - second.onsetSeconds;
    const total = firstGap + secondGap;
    const balanced =
      Math.min(firstGap, secondGap) / Math.max(firstGap, secondGap) >= 0.72;
    if (
      balanced &&
      total >= beatSeconds * 0.55 &&
      total <= beatSeconds * 0.9 &&
      firstGap >= beatSeconds * 0.22 &&
      secondGap >= beatSeconds * 0.22
    ) {
      indexes.add(index);
      indexes.add(index + 1);
      indexes.add(index + 2);
    }
  }
  return indexes;
}

function symbolicItems(notes: LocalNoteEvent[], bpm: number): SymbolicItem[] {
  const beatSeconds = 60 / bpm;
  const tripletIndexes = tripletNoteIndexes(notes, bpm);
  const items: SymbolicItem[] = [];
  let previousOffset = notes[0]?.onsetSeconds ?? 0;
  notes.forEach((note, index) => {
    const allowTriplet = tripletIndexes.has(index);
    const gap = note.onsetSeconds - previousOffset;
    if (gap > beatSeconds * 0.38)
      items.push({
        midi: null,
        ticks: nearestTick(gap / beatSeconds, allowTriplet),
      });
    const next = notes[index + 1];
    const detectedDuration = note.offsetSeconds - note.onsetSeconds;
    const interOnsetDuration = next
      ? next.onsetSeconds - note.onsetSeconds
      : detectedDuration;
    const releaseGap = next
      ? next.onsetSeconds - note.offsetSeconds
      : Number.POSITIVE_INFINITY;
    const notatedDuration =
      next && releaseGap < beatSeconds * 0.32
        ? interOnsetDuration
        : detectedDuration;
    items.push({
      midi: note.midi,
      ticks: nearestTick(notatedDuration / beatSeconds, allowTriplet),
    });
    previousOffset = note.onsetSeconds + notatedDuration;
  });
  return items;
}

function splitAcrossMeasures(items: SymbolicItem[]): SymbolicItem[][] {
  const measures: SymbolicItem[][] = [[]];
  let cursor = 0;
  for (const item of items) {
    let remaining = item.ticks;
    let firstChunk = true;
    while (remaining > 0) {
      const available = MEASURE_TICKS - cursor;
      const ticks = Math.min(remaining, available);
      measures.at(-1)?.push({
        midi: item.midi,
        ticks,
        tieStop: item.midi !== null && !firstChunk,
        tieStart: item.midi !== null && remaining > available,
      });
      remaining -= ticks;
      cursor += ticks;
      firstChunk = false;
      if (cursor >= MEASURE_TICKS && remaining > 0) {
        measures.push([]);
        cursor = 0;
      } else if (cursor >= MEASURE_TICKS) {
        measures.push([]);
        cursor = 0;
      }
    }
  }
  if (measures.at(-1)?.length === 0) measures.pop();
  const last = measures.at(-1);
  const used = last?.reduce((sum, item) => sum + item.ticks, 0) ?? 0;
  if (last && used < MEASURE_TICKS)
    last.push({ midi: null, ticks: MEASURE_TICKS - used });
  return measures;
}

function annotateRhythm(items: SymbolicItem[]): SymbolicItem[] {
  const annotated = items.map((item) => ({ ...item }));
  let cursor = 0;
  let beamGroup: number[] = [];
  let beamBeat = -1;

  function flushBeamGroup() {
    if (beamGroup.length >= 2) {
      beamGroup.forEach((itemIndex, groupIndex) => {
        const item = annotated[itemIndex];
        if (!item) return;
        const value =
          groupIndex === 0
            ? "begin"
            : groupIndex === beamGroup.length - 1
              ? "end"
              : "continue";
        const levels = noteType(item.ticks).type === "16th" ? 2 : 1;
        item.beams = Array.from({ length: levels }, () => value);
      });
    }
    beamGroup = [];
  }

  annotated.forEach((item, index) => {
    const notation = noteType(item.ticks);
    const beat = Math.floor(cursor / DIVISIONS);
    const endBeat = Math.floor((cursor + item.ticks - 1) / DIVISIONS);
    const beamable =
      item.midi !== null &&
      (notation.type === "eighth" || notation.type === "16th") &&
      beat === endBeat;
    if (!beamable || (beamGroup.length && beat !== beamBeat)) flushBeamGroup();
    if (beamable) {
      beamBeat = beat;
      beamGroup.push(index);
    }
    cursor += item.ticks;
  });
  flushBeamGroup();

  let tupletGroup: number[] = [];
  function flushTupletGroup() {
    let groupStart = 0;
    let groupTicks = 0;
    for (let index = 0; index < tupletGroup.length; index += 1) {
      groupTicks += annotated[tupletGroup[index] ?? -1]?.ticks ?? 0;
      if (groupTicks % DIVISIONS !== 0 || index - groupStart < 1) continue;
      const group = tupletGroup.slice(groupStart, index + 1);
      const first = annotated[group[0] ?? -1];
      const last = annotated[group.at(-1) ?? -1];
      if (first && last) {
        first.tuplet = "start";
        first.tupletBracket = !group.every(
          (itemIndex) => (annotated[itemIndex]?.beams?.length ?? 0) > 0,
        );
        last.tuplet = "stop";
      }
      groupStart = index + 1;
      groupTicks = 0;
    }
    tupletGroup = [];
  }
  annotated.forEach((item, index) => {
    if (noteType(item.ticks).actual === 3) tupletGroup.push(index);
    else flushTupletGroup();
  });
  flushTupletGroup();
  return annotated;
}

function itemXml(item: SymbolicItem): string {
  const notation = noteType(item.ticks);
  const timeModification = notation.actual
    ? `<time-modification><actual-notes>${notation.actual}</actual-notes><normal-notes>${notation.normal}</normal-notes></time-modification>`
    : "";
  const ties = `${item.tieStop ? '<tie type="stop"/>' : ""}${item.tieStart ? '<tie type="start"/>' : ""}`;
  const beams = (item.beams ?? [])
    .map((value, index) => `<beam number="${index + 1}">${value}</beam>`)
    .join("");
  const notationItems = `${item.tieStop ? '<tied type="stop"/>' : ""}${item.tieStart ? '<tied type="start"/>' : ""}${item.tuplet ? `<tuplet type="${item.tuplet}"${item.tuplet === "start" ? ` bracket="${item.tupletBracket ? "yes" : "no"}" show-number="actual"` : ""}/>` : ""}`;
  const notations = notationItems
    ? `<notations>${notationItems}</notations>`
    : "";
  return `<note>${item.midi === null ? "<rest/>" : pitchXml(item.midi)}<duration>${item.ticks}</duration>${ties}<voice>1</voice><type>${notation.type}</type>${notation.dotted ? "<dot/>" : ""}${timeModification}${beams}${notations}</note>`;
}

export function buildLocalMusicXml(
  notes: LocalNoteEvent[],
  bpm: number,
  title: string,
): string {
  if (!notes.length)
    throw new Error("No stable monophonic notes were detected.");
  const measures = splitAcrossMeasures(symbolicItems(notes, bpm))
    .map((items, index) => {
      const attributes =
        index === 0
          ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`
          : "";
      return `<measure number="${index + 1}">${attributes}${annotateRhythm(items).map(itemXml).join("")}</measure>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work><identification><creator type="software">Frasi browser transcription · Spotify Basic Pitch</creator><miscellaneous><miscellaneous-field name="scope">Machine-learned browser transcription of the selected region; rhythm and lead-line extraction remain reviewable.</miscellaneous-field><miscellaneous-field name="key-analysis">unavailable</miscellaneous-field></miscellaneous></identification><part-list><score-part id="P1"><part-name>Concert Pitch</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export async function transcribeAudioLocally(
  file: File,
  onProgress: (stage: string, progress: number) => void = () => undefined,
  selection: {
    startSeconds?: number;
    endSeconds?: number;
    instrumentId?: InstrumentId;
  } = {},
): Promise<{ musicXml: string; noteCount: number; bpm: number }> {
  onProgress("decoding_audio", 0.08);
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
  const startSeconds = selection.startSeconds ?? 0;
  const endSeconds = selection.endSeconds ?? decoded.duration;
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds ||
    endSeconds > decoded.duration + 0.05
  ) {
    throw new Error("The selected transcription range is invalid.");
  }
  const audio = downmixAndResampleSelection(
    decoded,
    startSeconds,
    Math.min(endSeconds, decoded.duration),
  );
  onProgress("loading_pitch_model", 0.12);
  const candidates = await transcribeWithBasicPitch(audio, (progress) =>
    onProgress("tracking_pitch", 0.15 + progress * 0.65),
  );
  onProgress("extracting_lead_line", 0.82);
  const notes = selectMelodicLine(candidates, {
    instrumentId: selection.instrumentId ?? "tenor_saxophone",
  });
  if (!notes.length)
    throw new Error(
      "No stable lead line was detected in that selection. Choose a clearer solo passage or a more isolated recording.",
    );
  const candidateTempo = estimateTempoFromCandidates(candidates);
  const melodicTempo = estimateTempo(notes);
  const bpm =
    Math.abs(candidateTempo - melodicTempo) <= 10
      ? Math.round((candidateTempo + melodicTempo) / 2)
      : candidateTempo;
  const title = file.name.replace(/\.[^.]+$/, "") || "Local transcription";
  const musicXml = buildLocalMusicXml(notes, bpm, title);
  onProgress("engraving_score", 0.96);
  return { musicXml, noteCount: notes.length, bpm };
}
