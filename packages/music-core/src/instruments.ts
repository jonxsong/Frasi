import type { InstrumentId } from "@frasi/shared-types";

export interface InstrumentDefinition {
  id: InstrumentId;
  name: string;
  writtenOffsetSemitones: number;
  clef: "treble" | "bass";
}

export const instruments: Record<InstrumentId, InstrumentDefinition> = {
  alto_saxophone: {
    id: "alto_saxophone",
    name: "Alto Saxophone",
    writtenOffsetSemitones: 9,
    clef: "treble",
  },
  tenor_saxophone: {
    id: "tenor_saxophone",
    name: "Tenor Saxophone",
    writtenOffsetSemitones: 14,
    clef: "treble",
  },
  soprano_saxophone: {
    id: "soprano_saxophone",
    name: "Soprano Saxophone",
    writtenOffsetSemitones: 2,
    clef: "treble",
  },
  baritone_saxophone: {
    id: "baritone_saxophone",
    name: "Baritone Saxophone",
    writtenOffsetSemitones: 21,
    clef: "treble",
  },
  trumpet: {
    id: "trumpet",
    name: "B♭ Trumpet",
    writtenOffsetSemitones: 2,
    clef: "treble",
  },
  trombone: {
    id: "trombone",
    name: "Trombone",
    writtenOffsetSemitones: 0,
    clef: "bass",
  },
};

export function toWrittenMidi(concertMidi: number, instrumentId: InstrumentId): number {
  return concertMidi + instruments[instrumentId].writtenOffsetSemitones;
}
