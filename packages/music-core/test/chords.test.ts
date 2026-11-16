import { describe, expect, it } from "vitest";
import { formatJazzChordSuffix, formatJazzChordSymbol } from "../src";

describe("jazz chord typography", () => {
  it.each([
    ["C", "C△"],
    ["Cmaj7", "C△7"],
    ["F#maj9", "F♯△9"],
    ["Dm7", "D−7"],
    ["Em7b5", "Eø7"],
    ["Bdim7", "B°7"],
    ["Abaug", "A♭+"],
    ["G7b9", "G7♭9"],
    ["Dbmaj7/F", "D♭△7/F"],
  ])("formats %s as %s", (source, expected) => {
    expect(formatJazzChordSymbol(source)).toBe(expected);
  });

  it("accepts common Unicode aliases", () => {
    expect(formatJazzChordSuffix("Δ7")).toBe("△7");
    expect(formatJazzChordSymbol("C♯ø7")).toBe("C♯ø7");
  });
});
