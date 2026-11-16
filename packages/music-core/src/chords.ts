const CHORD_PATTERN = /^([A-G])([#b♯♭]?)(.*?)(?:\/([A-G])([#b♯♭]?))?$/;

function accidentalGlyph(value: string): string {
  return value.replace("#", "♯").replace("b", "♭");
}

function normalizedSuffix(suffix: string): string {
  return suffix
    .trim()
    .replaceAll("♭", "b")
    .replaceAll("♯", "#")
    .replaceAll("Δ", "△")
    .replaceAll("º", "°")
    .replaceAll("Ø", "ø");
}

function jazzAlterations(value: string): string {
  return value.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");
}

/** Convert a stored chord suffix into compact, conventional jazz typography. */
export function formatJazzChordSuffix(suffix: string): string {
  const value = normalizedSuffix(suffix);
  if (!value || /^(?:maj|M|△)$/.test(value)) return "△";
  if (/^(?:maj|M|△)7$/.test(value)) return "△7";
  if (/^(?:maj|M|△)9$/.test(value)) return "△9";
  if (/^(?:maj|M|△)13$/.test(value)) return "△13";
  if (/^(?:m7b5|ø|ø7)$/.test(value)) return "ø7";

  const diminished = /^(?:dim|°|o)(7)?$/.exec(value);
  if (diminished) return diminished[1] ? "°7" : "°";

  const augmented = /^(?:aug|\+)(.*)$/.exec(value);
  if (augmented) return `+${jazzAlterations(augmented[1] ?? "")}`;

  const minorMajor = /^(?:mMaj|mM|m△|−△)(7|9)?$/.exec(value);
  if (minorMajor) return `−△${minorMajor[1] ?? "7"}`;

  const minor = /^(?:min|m|-|−)(.*)$/.exec(value);
  if (minor) return `−${jazzAlterations(minor[1] ?? "")}`;

  return jazzAlterations(value).replace(/^7sus4$/, "7sus");
}

/** Format a complete chord symbol while keeping its semantic storage spelling unchanged. */
export function formatJazzChordSymbol(symbol: string): string {
  const match = CHORD_PATTERN.exec(symbol.trim());
  if (!match) return symbol;
  const [
    ,
    root = "C",
    rootAccidental = "",
    suffix = "",
    bass,
    bassAccidental = "",
  ] = match;
  const rootText = `${root}${accidentalGlyph(rootAccidental)}`;
  const bassText = bass ? `/${bass}${accidentalGlyph(bassAccidental)}` : "";
  return `${rootText}${formatJazzChordSuffix(suffix)}${bassText}`;
}
