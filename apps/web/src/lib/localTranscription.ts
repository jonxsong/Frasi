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

const TARGET_SAMPLE_RATE = 11_025;
const FRAME_SIZE = 2_048;
const HOP_SIZE = 512;
const MAX_ANALYSIS_SECONDS = 20;
const DIVISIONS = 12;
const MEASURE_TICKS = DIVISIONS * 4;
const TICK_CANDIDATES = [3, 4, 6, 8, 9, 12, 18, 24, 36, 48];
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

function nearestTick(beats: number): number {
  const raw = Math.max(0.25, beats) * DIVISIONS;
  return TICK_CANDIDATES.reduce((best, candidate) =>
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

function downmixAndResample(buffer: AudioBuffer): Float32Array {
  const sourceLength = Math.min(
    buffer.length,
    Math.floor(MAX_ANALYSIS_SECONDS * buffer.sampleRate),
  );
  const ratio = buffer.sampleRate / TARGET_SAMPLE_RATE;
  const output = new Float32Array(
    Math.max(1, Math.floor(sourceLength / ratio)),
  );
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) =>
    buffer.getChannelData(index),
  );
  for (let target = 0; target < output.length; target += 1) {
    const sourceStart = Math.floor(target * ratio);
    const sourceEnd = Math.min(
      sourceLength,
      Math.max(sourceStart + 1, Math.floor((target + 1) * ratio)),
    );
    let value = 0;
    let count = 0;
    for (let source = sourceStart; source < sourceEnd; source += 1) {
      for (const channel of channels) {
        value += channel[source] ?? 0;
        count += 1;
      }
    }
    output[target] = count ? value / count : 0;
  }
  return output;
}

function observationsToNotes(
  observations: Array<PitchEstimate & { time: number }>,
): LocalNoteEvent[] {
  if (!observations.length) return [];
  const frameSeconds = HOP_SIZE / TARGET_SAMPLE_RATE;
  const notes: LocalNoteEvent[] = [];
  let group: Array<PitchEstimate & { time: number }> = [];

  function flush() {
    if (group.length < 2) {
      group = [];
      return;
    }
    const roundedMidi = Math.round(median(group.map((item) => item.midi)));
    const onsetSeconds = group[0]?.time ?? 0;
    const offsetSeconds = (group.at(-1)?.time ?? onsetSeconds) + frameSeconds;
    notes.push({
      midi: roundedMidi,
      onsetSeconds,
      offsetSeconds,
      confidence:
        group.reduce((sum, item) => sum + item.confidence, 0) / group.length,
    });
    group = [];
  }

  for (const observation of observations) {
    const previous = group.at(-1);
    const groupPitch = group.length
      ? Math.round(median(group.map((item) => item.midi)))
      : Math.round(observation.midi);
    const discontinuity =
      previous &&
      (observation.time - previous.time > frameSeconds * 1.8 ||
        Math.abs(Math.round(observation.midi) - groupPitch) >= 1);
    if (discontinuity) flush();
    group.push(observation);
  }
  flush();

  const merged: LocalNoteEvent[] = [];
  for (const note of notes) {
    const previous = merged.at(-1);
    if (
      previous &&
      previous.midi === note.midi &&
      note.onsetSeconds - previous.offsetSeconds < 0.11
    ) {
      previous.offsetSeconds = note.offsetSeconds;
      previous.confidence = (previous.confidence + note.confidence) / 2;
    } else {
      merged.push({ ...note });
    }
  }
  return merged.slice(0, 96);
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

interface SymbolicItem {
  midi: number | null;
  ticks: number;
  tieStart?: boolean;
  tieStop?: boolean;
}

function symbolicItems(notes: LocalNoteEvent[], bpm: number): SymbolicItem[] {
  const beatSeconds = 60 / bpm;
  const items: SymbolicItem[] = [];
  let previousOffset = notes[0]?.onsetSeconds ?? 0;
  for (const note of notes) {
    const gap = note.onsetSeconds - previousOffset;
    if (gap > beatSeconds * 0.2)
      items.push({ midi: null, ticks: nearestTick(gap / beatSeconds) });
    items.push({
      midi: note.midi,
      ticks: nearestTick(
        (note.offsetSeconds - note.onsetSeconds) / beatSeconds,
      ),
    });
    previousOffset = note.offsetSeconds;
  }
  return items;
}

function splitAcrossMeasures(items: SymbolicItem[]): SymbolicItem[][] {
  const measures: SymbolicItem[][] = [[]];
  let cursor = 0;
  for (const item of items) {
    let remaining = item.ticks;
    let firstChunk = true;
    while (remaining > 0 && measures.length <= 24) {
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

function itemXml(item: SymbolicItem): string {
  const notation = noteType(item.ticks);
  const timeModification = notation.actual
    ? `<time-modification><actual-notes>${notation.actual}</actual-notes><normal-notes>${notation.normal}</normal-notes></time-modification>`
    : "";
  const ties = `${item.tieStop ? '<tie type="stop"/>' : ""}${item.tieStart ? '<tie type="start"/>' : ""}`;
  const tiedNotations =
    item.tieStart || item.tieStop
      ? `<notations>${item.tieStop ? '<tied type="stop"/>' : ""}${item.tieStart ? '<tied type="start"/>' : ""}</notations>`
      : "";
  return `<note>${item.midi === null ? "<rest/>" : pitchXml(item.midi)}<duration>${item.ticks}</duration><voice>1</voice><type>${notation.type}</type>${notation.dotted ? "<dot/>" : ""}${timeModification}${ties}${tiedNotations}</note>`;
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
          ? `<attributes><divisions>${DIVISIONS}</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><direction placement="above"><direction-type><words>Local browser transcription · review required</words></direction-type><sound tempo="${bpm}"/></direction>`
          : "";
      return `<measure number="${index + 1}">${attributes}${items.map(itemXml).join("")}</measure>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?><score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work><identification><creator type="software">Frasi local monophonic autocorrelation baseline</creator><miscellaneous><miscellaneous-field name="scope">Real browser-side pitch analysis; rhythm is estimated and requires review.</miscellaneous-field></miscellaneous></identification><part-list><score-part id="P1"><part-name>Concert Pitch</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export async function transcribeAudioLocally(
  file: File,
  onProgress: (stage: string, progress: number) => void = () => undefined,
): Promise<{ musicXml: string; noteCount: number; bpm: number }> {
  onProgress("decoding_audio", 0.08);
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer());
  } finally {
    await context.close();
  }
  const audio = downmixAndResample(decoded);
  const observations: Array<PitchEstimate & { time: number }> = [];
  const frameCount = Math.max(
    0,
    Math.floor((audio.length - FRAME_SIZE) / HOP_SIZE),
  );
  onProgress("tracking_pitch", 0.18);
  for (let frameIndex = 0; frameIndex <= frameCount; frameIndex += 1) {
    const start = frameIndex * HOP_SIZE;
    const estimate = detectPitch(
      audio.subarray(start, start + FRAME_SIZE),
      TARGET_SAMPLE_RATE,
    );
    if (estimate)
      observations.push({ ...estimate, time: start / TARGET_SAMPLE_RATE });
    if (frameIndex % 24 === 0) {
      onProgress(
        "tracking_pitch",
        0.18 + (frameIndex / Math.max(1, frameCount)) * 0.58,
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
    }
  }
  onProgress("interpreting_rhythm", 0.82);
  const notes = observationsToNotes(observations);
  if (!notes.length)
    throw new Error(
      "No stable monophonic phrase was detected. Try a clearer solo or a WAV recording.",
    );
  const bpm = estimateTempo(notes);
  const title = file.name.replace(/\.[^.]+$/, "") || "Local transcription";
  const musicXml = buildLocalMusicXml(notes, bpm, title);
  onProgress("engraving_score", 0.96);
  return { musicXml, noteCount: notes.length, bpm };
}
