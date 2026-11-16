import { describe, expect, it } from "vitest";

import { createDemoMusicXml } from "./demoScore";

function measures(xml: string): string[] {
  return Array.from(
    xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g),
    (match) => match[0],
  );
}

describe("demo score", () => {
  it("shows ledger notes above and below the staff in the opening phrase", () => {
    const openingMeasures = measures(createDemoMusicXml());

    expect(openingMeasures[0]).toContain("<step>C</step><octave>4</octave>");
    expect(openingMeasures[1]).toContain("<step>C</step><octave>6</octave>");
    expect(openingMeasures[0]).toContain('<beam number="1">begin</beam>');
    expect(openingMeasures[0]).toContain('<beam number="1">end</beam>');
  });
});
