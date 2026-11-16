"use client";

import { useEffect, useRef, useState } from "react";
import {
  Music2,
  PencilLine,
  ScanLine,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { transposeMusicXml } from "@/lib/musicXml";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";
import { AnalysisPanel } from "./AnalysisPanel";
import { ScoreCorrectionDialog } from "./ScoreCorrectionDialog";
import { ApiError, apiFetch } from "@/lib/api";

function sanitizeSvg(svg: string): string {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  document
    .querySelectorAll("script, foreignObject")
    .forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on"))
        node.removeAttribute(attribute.name);
      if (
        ["href", "xlink:href"].includes(attribute.name) &&
        attribute.value.startsWith("javascript:")
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  return new XMLSerializer().serializeToString(document.documentElement);
}

const tabs = [
  { id: "score" as const, label: "Score" },
  { id: "analysis" as const, label: "Analysis" },
  { id: "practice" as const, label: "Practice" },
];

const practiceKeys = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const MIN_SCORE_ZOOM = 0.4;
const MAX_SCORE_ZOOM = 1.6;
const MIN_SCORE_HEIGHT = 300;
const MAX_SCORE_HEIGHT = 900;

interface ScorePanelProps {
  onNotify: (message: string) => void;
}

export function ScorePanel({ onNotify }: ScorePanelProps) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scoreCardRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(
    null,
  );
  const musicXml = useStudioStore((state) => state.musicXml);
  const transposeSemitones = useStudioStore(
    (state) => state.transposeSemitones,
  );
  const transposeKey = useStudioStore((state) => state.transposeKey);
  const scoreTab = useStudioStore((state) => state.scoreTab);
  const currentTime = useStudioStore((state) => state.currentTime);
  const selectionStart = useStudioStore((state) => state.selectionStart);
  const selectionEnd = useStudioStore((state) => state.selectionEnd);
  const isDemo = useStudioStore((state) => state.isDemo);
  const setScoreTab = useStudioStore((state) => state.setScoreTab);
  const setCurrentTime = useStudioStore((state) => state.setCurrentTime);
  const setTranspose = useStudioStore((state) => state.setTranspose);
  const projectId = useStudioStore((state) => state.projectId);
  const revisionId = useStudioStore((state) => state.revisionId);
  const projectTitle = useStudioStore((state) => state.projectTitle);
  const speed = useStudioStore((state) => state.speed);
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mastered, setMastered] = useState<Set<string>>(new Set());
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [practiceStartedAt] = useState(() => Date.now());
  const [scoreZoom, setScoreZoom] = useState(1);
  const [scoreHeight, setScoreHeight] = useState<number | null>(null);

  useEffect(() => {
    const resize = (event: PointerEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      setScoreHeight(
        Math.max(
          MIN_SCORE_HEIGHT,
          Math.min(
            MAX_SCORE_HEIGHT,
            state.startHeight + event.clientY - state.startY,
          ),
        ),
      );
    };
    const stopResize = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    let active = true;
    let toolkit: import("verovio/esm").VerovioToolkit | null = null;
    async function render() {
      try {
        const [{ default: createVerovioModule }, { VerovioToolkit }] =
          await Promise.all([import("verovio/wasm"), import("verovio/esm")]);
        const wasmModule = await createVerovioModule();
        if (!active) return;
        toolkit = new VerovioToolkit(wasmModule);
        toolkit.setOptions({
          pageWidth: 1480,
          pageHeight: 620,
          scale: 43,
          adjustPageHeight: true,
          breaks: "auto",
          header: "none",
          footer: "none",
          spacingStaff: 8,
          spacingSystem: 11,
        });
        const displayXml = transposeMusicXml(
          musicXml,
          transposeSemitones,
          transposeKey,
        );
        if (!toolkit.loadData(displayXml))
          throw new Error("Notation engine rejected this score.");
        const pages = Math.min(toolkit.getPageCount(), 4);
        const rendered = Array.from(
          { length: pages },
          (_, index) => toolkit?.renderToSVG(index + 1) ?? "",
        )
          .map(sanitizeSvg)
          .join("");
        if (active) {
          setSvg(rendered);
          setRenderError(null);
        }
      } catch (cause) {
        if (active) {
          setRenderError(
            cause instanceof Error
              ? cause.message
              : "Unable to engrave this score.",
          );
        }
      } finally {
        toolkit?.destroy();
        toolkit = null;
      }
    }
    void render();
    return () => {
      active = false;
      toolkit?.destroy();
    };
  }, [musicXml, transposeKey, transposeSemitones]);

  useEffect(() => {
    const measures =
      scoreRef.current?.querySelectorAll<SVGGElement>("g.measure");
    if (!measures?.length) return;
    const progress = Math.max(
      0,
      Math.min(
        0.999,
        (currentTime - selectionStart) / (selectionEnd - selectionStart),
      ),
    );
    const activeIndex = Math.floor(progress * measures.length);
    measures.forEach((measure, index) => {
      measure.toggleAttribute("data-active", index === activeIndex);
    });
  }, [currentTime, selectionEnd, selectionStart, svg]);

  function seekFromScore(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    const measure = target.closest("g.measure");
    if (!measure || !scoreRef.current) return;
    const measures = Array.from(scoreRef.current.querySelectorAll("g.measure"));
    const index = measures.indexOf(measure);
    if (index < 0) return;
    setCurrentTime(
      selectionStart +
        (index / measures.length) * (selectionEnd - selectionStart),
    );
  }

  function updateScoreZoom(next: number) {
    setScoreZoom(
      Math.max(MIN_SCORE_ZOOM, Math.min(MAX_SCORE_ZOOM, next)),
    );
  }

  function fitScoreToView() {
    const availableWidth = (scoreCardRef.current?.clientWidth ?? 978) - 48;
    updateScoreZoom(Math.min(1, availableWidth / 930));
  }

  function handleResizeKey(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const current = scoreCardRef.current?.getBoundingClientRect().height ?? 435;
    const delta = event.key === "ArrowUp" ? -32 : 32;
    setScoreHeight(
      Math.max(MIN_SCORE_HEIGHT, Math.min(MAX_SCORE_HEIGHT, current + delta)),
    );
  }

  return (
    <section className={styles.scoreSection} aria-label="Interactive score">
      <div className={styles.scoreTabs} role="tablist" aria-label="Score views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={
              scoreTab === tab.id ? styles.scoreTabActive : styles.scoreTab
            }
            onClick={() => setScoreTab(tab.id)}
            role="tab"
            aria-selected={scoreTab === tab.id}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {scoreTab === "score" && (
        <div
          ref={scoreCardRef}
          className={styles.notationCard}
          style={scoreHeight ? { height: `${scoreHeight}px` } : undefined}
        >
          <div className={styles.notationMeta}>
            <div className={styles.notationContext}>
              <span>♩ = 140</span>
              <span>Swing</span>
            </div>
            {isDemo && (
              <small>
                Clearly labeled demo score · click a measure to seek
              </small>
            )}
            {!isDemo && projectId && (
              <button
                className={styles.correctScoreButton}
                onClick={() => setCorrectionOpen(true)}
                type="button"
              >
                <PencilLine size={13} /> Correct score
              </button>
            )}
            <div
              className={styles.scoreViewControls}
              role="group"
              aria-label="Score size controls"
            >
              <button
                onClick={() => updateScoreZoom(scoreZoom - 0.1)}
                disabled={scoreZoom <= MIN_SCORE_ZOOM}
                aria-label="Zoom out score"
                type="button"
              >
                <ZoomOut size={15} />
              </button>
              <output aria-label="Score zoom">
                {Math.round(scoreZoom * 100)}%
              </output>
              <button
                onClick={() => updateScoreZoom(scoreZoom + 0.1)}
                disabled={scoreZoom >= MAX_SCORE_ZOOM}
                aria-label="Zoom in score"
                type="button"
              >
                <ZoomIn size={15} />
              </button>
              <button
                onClick={fitScoreToView}
                aria-label="Fit score to view"
                title="Fit score to view"
                type="button"
              >
                <ScanLine size={15} />
              </button>
            </div>
          </div>
          <div className={styles.scoreViewport}>
            {renderError ? (
              <div className={styles.scoreError}>
                <Music2 size={24} />
                <strong>Score rendering needs attention</strong>
                <span>{renderError}</span>
              </div>
            ) : svg ? (
              <div
                ref={scoreRef}
                className={styles.scoreSvg}
                style={{
                  width: `${scoreZoom * 100}%`,
                  minWidth: `${Math.round(930 * scoreZoom)}px`,
                }}
                onClick={seekFromScore}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <div className={styles.scoreLoading}>Engraving notation…</div>
            )}
          </div>
          <button
            className={styles.scoreResizeHandle}
            onPointerDown={(event) => {
              event.preventDefault();
              resizeRef.current = {
                startY: event.clientY,
                startHeight:
                  scoreCardRef.current?.getBoundingClientRect().height ?? 435,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              document.body.style.cursor = "ns-resize";
              document.body.style.userSelect = "none";
            }}
            onPointerMove={(event) => {
              const state = resizeRef.current;
              if (!state || !event.currentTarget.hasPointerCapture(event.pointerId))
                return;
              setScoreHeight(
                Math.max(
                  MIN_SCORE_HEIGHT,
                  Math.min(
                    MAX_SCORE_HEIGHT,
                    state.startHeight + event.clientY - state.startY,
                  ),
                ),
              );
            }}
            onDoubleClick={() => setScoreHeight(null)}
            onKeyDown={handleResizeKey}
            role="separator"
            aria-label="Resize score panel"
            aria-orientation="horizontal"
            aria-valuemin={MIN_SCORE_HEIGHT}
            aria-valuemax={MAX_SCORE_HEIGHT}
            aria-valuenow={scoreHeight ?? 435}
            title="Drag to resize · double-click to reset"
            type="button"
          >
            <span className={styles.scoreResizeGrip} />
            <span>Drag to resize</span>
          </button>
        </div>
      )}

      {scoreTab === "analysis" && <AnalysisPanel />}

      {(scoreTab === "practice" || scoreTab === "keys") && (
        <div className={styles.practiceGrid}>
          <div className={styles.practiceIntro}>
            <p className={styles.eyebrow}>TWELVE-KEY PRACTICE</p>
            <h2>Move the phrase through every center.</h2>
            <p>
              Concert-pitch intervals and rhythm stay fixed. Mark a key when the
              phrase feels settled.
            </p>
          </div>
          <div className={styles.keyGrid}>
            {practiceKeys.map((key) => (
              <button
                key={key}
                className={
                  mastered.has(key) ? styles.keyMastered : styles.keyCard
                }
                onClick={() => {
                  setMastered((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                  const semitones = practiceKeys.indexOf(key);
                  setTranspose(
                    semitones,
                    semitones === 0 ? "C (Original)" : key,
                  );
                }}
                type="button"
              >
                <strong>{key}</strong>
                <span>{mastered.has(key) ? "Mastered" : "Practice"}</span>
              </button>
            ))}
          </div>
          <div className={styles.practiceActions}>
            <button
              onClick={() => {
                if (!projectId) {
                  const sessions = JSON.parse(
                    localStorage.getItem("frasi-guest-practice") ?? "[]",
                  ) as unknown[];
                  sessions.push({
                    completed_at: new Date().toISOString(),
                    title: projectTitle ?? "Guest phrase",
                    duration_seconds: Math.max(
                      1,
                      Math.round((Date.now() - practiceStartedAt) / 1000),
                    ),
                    tempo_bpm: 140 * speed,
                    practiced_keys: [...mastered],
                    mastered_keys: [...mastered],
                  });
                  localStorage.setItem(
                    "frasi-guest-practice",
                    JSON.stringify(sessions.slice(-100)),
                  );
                  onNotify("Practice session saved in this browser");
                  return;
                }
                void apiFetch("/api/v1/practice-sessions", {
                  method: "POST",
                  body: JSON.stringify({
                    project_id: projectId,
                    duration_seconds: Math.max(
                      1,
                      Math.round((Date.now() - practiceStartedAt) / 1000),
                    ),
                    tempo_bpm: 140 * speed,
                    practiced_keys: [...mastered],
                    mastered_keys: [...mastered],
                  }),
                })
                  .then(() => onNotify("Practice session logged"))
                  .catch((cause) =>
                    onNotify(
                      cause instanceof ApiError
                        ? cause.message
                        : "Could not log practice",
                    ),
                  );
              }}
              type="button"
            >
              Log practice
            </button>
            <button
              onClick={() => {
                const measureCount = new DOMParser()
                  .parseFromString(musicXml, "application/xml")
                  .querySelectorAll("measure").length;
                if (!projectId || !revisionId) {
                  const phrases = JSON.parse(
                    localStorage.getItem("frasi-guest-vocabulary") ?? "[]",
                  ) as unknown[];
                  phrases.push({
                    id: crypto.randomUUID(),
                    saved_at: new Date().toISOString(),
                    title: projectTitle ?? "Guest phrase",
                    music_xml: musicXml,
                    start_measure: 1,
                    end_measure: Math.max(1, measureCount),
                    source_start_seconds: selectionStart,
                    source_end_seconds: selectionEnd,
                    tags: ["guest", "practice"],
                  });
                  localStorage.setItem(
                    "frasi-guest-vocabulary",
                    JSON.stringify(phrases.slice(-100)),
                  );
                  onNotify("Phrase saved to your browser vocabulary");
                  return;
                }
                void apiFetch("/api/v1/vocabulary", {
                  method: "POST",
                  body: JSON.stringify({
                    project_id: projectId,
                    revision_id: revisionId,
                    title: projectTitle ?? "Practice phrase",
                    start_measure: 1,
                    end_measure: Math.max(1, measureCount),
                    source_start_seconds: selectionStart,
                    source_end_seconds: selectionEnd,
                    tags: ["practice"],
                  }),
                })
                  .then(() => onNotify("Phrase saved to your vocabulary"))
                  .catch((cause) =>
                    onNotify(
                      cause instanceof ApiError
                        ? cause.message
                        : "Could not save phrase",
                    ),
                  );
              }}
              type="button"
            >
              Save to vocabulary
            </button>
          </div>
        </div>
      )}
      {correctionOpen && (
        <ScoreCorrectionDialog
          onClose={() => setCorrectionOpen(false)}
          onNotify={onNotify}
        />
      )}
    </section>
  );
}
