import type { InstrumentId } from "@frasi/shared-types";

export interface InstrumentDefinition {
  id: InstrumentId;
  name: string;
  writtenOffsetSemitones: number;
  lowestWrittenMidi: number;
  standardHighestWrittenMidi: number;
  /** Null when extended technique has no useful fixed acoustic ceiling. */
  highestWrittenMidi: number | null;
  clef: "treble" | "bass";
}

export const instruments: Record<InstrumentId, InstrumentDefinition> = {
  alto_saxophone: {
    id: "alto_saxophone",
    name: "Alto Saxophone",
    writtenOffsetSemitones: 9,
    lowestWrittenMidi: 58,
    standardHighestWrittenMidi: 90,
    highestWrittenMidi: 90,
    clef: "treble",
  },
  tenor_saxophone: {
    id: "tenor_saxophone",
    name: "Tenor Saxophone",
    writtenOffsetSemitones: 14,
    lowestWrittenMidi: 58,
    standardHighestWrittenMidi: 90,
    // Written F♯6 (90) ends the conventional range, but altissimo continues above it.
    highestWrittenMidi: null,
    clef: "treble",
  },
  soprano_saxophone: {
    id: "soprano_saxophone",
    name: "Soprano Saxophone",
    writtenOffsetSemitones: 2,
    lowestWrittenMidi: 58,
    standardHighestWrittenMidi: 90,
    highestWrittenMidi: 90,
    clef: "treble",
  },
  baritone_saxophone: {
    id: "baritone_saxophone",
    name: "Baritone Saxophone",
    writtenOffsetSemitones: 21,
    lowestWrittenMidi: 58,
    standardHighestWrittenMidi: 90,
    highestWrittenMidi: 90,
    clef: "treble",
  },
  trumpet: {
    id: "trumpet",
    name: "B♭ Trumpet",
    writtenOffsetSemitones: 2,
    lowestWrittenMidi: 54,
    standardHighestWrittenMidi: 86,
    highestWrittenMidi: 86,
    clef: "treble",
  },
  trombone: {
    id: "trombone",
    name: "Trombone",
    writtenOffsetSemitones: 0,
    lowestWrittenMidi: 40,
    standardHighestWrittenMidi: 77,
    highestWrittenMidi: 77,
    clef: "bass",
  },
};

export function toWrittenMidi(
  concertMidi: number,
  instrumentId: InstrumentId,
): number {
  return concertMidi + instruments[instrumentId].writtenOffsetSemitones;
}

export function concertRange(instrumentId: InstrumentId): {
  minimum: number;
  maximum: number;
} {
  const instrument = instruments[instrumentId];
  return {
    minimum: instrument.lowestWrittenMidi - instrument.writtenOffsetSemitones,
    maximum:
      (instrument.highestWrittenMidi ?? 127) -
      instrument.writtenOffsetSemitones,
  };
}

export function conventionalConcertRange(instrumentId: InstrumentId): {
  minimum: number;
  maximum: number;
} {
  const instrument = instruments[instrumentId];
  return {
    minimum: instrument.lowestWrittenMidi - instrument.writtenOffsetSemitones,
    maximum:
      instrument.standardHighestWrittenMidi - instrument.writtenOffsetSemitones,
  };
}
