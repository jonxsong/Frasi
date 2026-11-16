export type InstrumentId =
  | "alto_saxophone"
  | "tenor_saxophone"
  | "soprano_saxophone"
  | "baritone_saxophone"
  | "trumpet"
  | "trombone";

export type JobStatus = "queued" | "processing" | "succeeded" | "failed";

export interface Rational {
  numerator: number;
  denominator: number;
}

export interface PerformanceTiming {
  onsetSeconds: number;
  offsetSeconds: number;
  detectedMidi: number;
  pitchConfidence: number;
  onsetConfidence: number;
}

export interface SymbolicTiming {
  measure: number;
  beat: Rational;
  duration: Rational;
  tuplet?: { actual: number; normal: number };
  tieStart?: boolean;
  tieStop?: boolean;
}

export interface NoteEvent {
  id: string;
  concertMidi: number;
  spelling: string;
  performance: PerformanceTiming;
  symbolic: SymbolicTiming;
  voice: number;
  articulation?: "accent" | "staccato" | "tenuto";
}

export interface ChordEvent {
  id: string;
  measure: number;
  beat: Rational;
  symbol: string;
  source: "manual" | "imported" | "estimated";
  confidence?: number;
  locked: boolean;
}

export interface TempoEvent {
  atSeconds: number;
  measure: number;
  beat: Rational;
  bpm: number;
}

export interface ScoreDocument {
  id: string;
  revision: number;
  title: string;
  concertKey: string;
  timeSignature: { beats: number; beatType: number };
  notes: NoteEvent[];
  chords: ChordEvent[];
  tempoMap: TempoEvent[];
  musicXml: string;
}

export interface RecordingSummary {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  year?: number;
  durationSeconds: number;
  sourceKind: "upload" | "youtube" | "spotify";
  artworkUrl?: string;
}

export interface TranscriptionProject {
  id: string;
  recordingId: string;
  instrument: InstrumentId;
  segmentStartSeconds: number;
  segmentEndSeconds: number;
  status: JobStatus;
  score?: ScoreDocument;
}

export interface ApiError {
  code: string;
  message: string;
  field?: string;
}

export interface JobProgress {
  id: string;
  status: JobStatus;
  progress: number;
  stage?: string;
  error?: ApiError;
}
