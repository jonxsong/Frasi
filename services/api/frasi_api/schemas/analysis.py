from pydantic import BaseModel


class ChordInsightResponse(BaseModel):
    measure: int
    beat: float
    symbol: str
    roman_numeral: str
    confidence: float
    source: str
    likely_scales: list[str]
    explanation: str


class HarmonyResponse(BaseModel):
    revision_id: str
    key: str
    mode: str
    key_confidence: float
    chords: list[ChordInsightResponse]
    patterns: list[str]
    caveats: list[str]
