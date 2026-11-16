import { useEffect, useState } from "react";
import { BookOpen, PencilLine, Sparkles } from "lucide-react";
import { ApiError, apiFetch, type HarmonyResponse } from "@/lib/api";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

export function AnalysisPanel() {
  const projectId = useStudioStore((state) => state.projectId);
  const revisionId = useStudioStore((state) => state.revisionId);
  const [analysis, setAnalysis] = useState<HarmonyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !revisionId) return;
    let active = true;
    apiFetch<HarmonyResponse>(`/api/v1/transcriptions/${projectId}/analysis`)
      .then((result) => active && setAnalysis(result))
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof ApiError ? cause.message : "Analysis unavailable",
          ),
      );
    return () => {
      active = false;
    };
  }, [projectId, revisionId]);

  const first = analysis?.chords[0];
  return (
    <div className={styles.insightGrid}>
      <article>
        <span>
          <Sparkles size={17} /> HARMONIC PATH
        </span>
        <h3>
          {analysis
            ? `${analysis.key} · ${Math.round(analysis.key_confidence * 100)}%`
            : "Minor ii–V into a tonic release"}
        </h3>
        <p>
          {analysis?.patterns[0] ??
            "The demo phrase targets guide tones through Dm7–G7–Cmaj7. Analysis is deterministic and score-derived."}
        </p>
      </article>
      <article>
        <span>
          <PencilLine size={17} /> FUNCTION & SCALE
        </span>
        <h3>
          {first
            ? `${first.symbol} · ${first.roman_numeral}`
            : "Ascending tension, descending answer"}
        </h3>
        <p>
          {first
            ? `${first.explanation} Likely colors: ${first.likely_scales.join(", ")}.`
            : "Chromatic approaches resolve by step while rhythmic density relaxes at the cadence."}
        </p>
      </article>
      <article>
        <span>
          <BookOpen size={17} /> CONFIDENCE
        </span>
        <h3>
          {first
            ? `${Math.round(first.confidence * 100)}% · ${first.source}`
            : "Bebop dominant connection"}
        </h3>
        <p>
          {error ??
            analysis?.caveats[0] ??
            "Save the selected measures to compare the same interval pattern in all twelve keys."}
        </p>
      </article>
    </div>
  );
}
