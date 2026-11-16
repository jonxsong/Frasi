// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { toWrittenPartMusicXml, transposeMusicXml } from "./musicXml";

const xml = `<?xml version="1.0"?><score-partwise><part><measure><attributes><key><fifths>0</fifths></key></attributes><harmony><root><root-step>C</root-step></root><kind text="△7">major-seventh</kind><bass><bass-step>E</bass-step></bass></harmony><note><pitch><step>B</step><octave>4</octave></pitch></note></measure></part></score-partwise>`;

describe("MusicXML display transposition", () => {
  it("transposes pitch, octave, harmony, and key signature", () => {
    const result = transposeMusicXml(xml, 2, "D");
    expect(result).toContain(
      "<step>C</step><alter>1</alter><octave>5</octave>",
    );
    expect(result).toContain("<root-step>D</root-step>");
    expect(result).toContain('text="△7"');
    expect(result).toContain(
      "<bass><bass-step>F</bass-step><bass-alter>1</bass-alter></bass>",
    );
    expect(result).toContain("<fifths>2</fifths>");
  });

  it("uses flat spelling in flat keys", () => {
    const result = transposeMusicXml(xml, 3, "Eb");
    expect(result).toContain("<step>D</step><octave>5</octave>");
    expect(result).toContain(
      "<root-step>E</root-step><root-alter>-1</root-alter>",
    );
  });

  it("does not rewrite canonical XML for zero semitones", () => {
    expect(transposeMusicXml(xml, 0, "C")).toBe(xml);
  });

  it("writes a tenor B-flat part a major ninth above concert pitch", () => {
    const concertAb = `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Concert Pitch</part-name></score-part></part-list><part id="P1"><measure><attributes><key><fifths>-4</fifths></key></attributes><note><pitch><step>A</step><alter>-1</alter><octave>2</octave></pitch></note></measure></part></score-partwise>`;
    const result = toWrittenPartMusicXml(concertAb, "tenor_saxophone");
    expect(result).toContain("<part-name>Tenor Saxophone in B♭</part-name>");
    expect(result).toContain(
      "<step>B</step><alter>-1</alter><octave>3</octave>",
    );
    expect(result).toContain("<fifths>-2</fifths>");
  });
});
