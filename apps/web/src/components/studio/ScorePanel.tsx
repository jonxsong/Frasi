"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Music2, PencilLine, Sparkles } from "lucide-react";
import { instruments } from "@frasi/music-core";
import { transposeMusicXml } from "@/lib/musicXml";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

function sanitizeSvg(svg: string): string {
  const document = new DOMParser().parseFromString(svg, "image/svg+xml");
  document.querySelectorAll("script, foreignObject").forEach((node) => node.remove());
  document.querySelectorAll("*").forEach((node) => {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.toLowerCase().startsWith("on")) node.removeAttribute(attribute.name);
      if (["href", "xlink:href"].includes(attribute.name) && attribute.value.startsWith("javascript:")) {
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
  { id: "keys" as const, label: "All 12 Keys" },
];

const practiceKeys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export function ScorePanel() {
  const scoreRef = useRef<HTMLDivElement>(null);
  const musicXml = useStudioStore((state) => state.musicXml);
  const pitchView = useStudioStore((state) => state.pitchView);
  const transposeSemitones = useStudioStore((state) => state.transposeSemitones);
  const transposeKey = useStudioStore((state) => state.transposeKey);
  const instrument = useStudioStore((state) => state.instrument);
  const scoreTab = useStudioStore((state) => state.scoreTab);
  const currentTime = useStudioStore((state) => state.currentTime);
  const selectionStart = useStudioStore((state) => state.selectionStart);
  const selectionEnd = useStudioStore((state) => state.selectionEnd);
  const isDemo = useStudioStore((state) => state.isDemo);
  const setScoreTab = useStudioStore((state) => state.setScoreTab);
  const setCurrentTime = useStudioStore((state) => state.setCurrentTime);
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [mastered, setMastered] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    let toolkit: import("verovio/esm").VerovioToolkit | null = null;
    async function render() {
      try {
        const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
          import("verovio/wasm"),
          import("verovio/esm"),
        ]);
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
        const writtenOffset = pitchView === "instrument" ? instruments[instrument].writtenOffsetSemitones : 0;
        const displayXml = transposeMusicXml(musicXml, transposeSemitones + writtenOffset, transposeKey);
        if (!toolkit.loadData(displayXml)) throw new Error("Notation engine rejected this score.");
        const pages = Math.min(toolkit.getPageCount(), 4);
        const rendered = Array.from({ length: pages }, (_, index) => toolkit?.renderToSVG(index + 1) ?? "")
          .map(sanitizeSvg)
          .join("");
        if (active) {
          setSvg(rendered);
          setRenderError(null);
        }
      } catch (cause) {
        if (active) {
          setRenderError(cause instanceof Error ? cause.message : "Unable to engrave this score.");
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
  }, [instrument, musicXml, pitchView, transposeKey, transposeSemitones]);

  useEffect(() => {
    const measures = scoreRef.current?.querySelectorAll<SVGGElement>("g.measure");
    if (!measures?.length) return;
    const progress = Math.max(0, Math.min(0.999, (currentTime - selectionStart) / (selectionEnd - selectionStart)));
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
    setCurrentTime(selectionStart + (index / measures.length) * (selectionEnd - selectionStart));
  }

  return (
    <section className={styles.scoreSection} aria-label="Interactive score">
      <div className={styles.scoreTabs} role="tablist" aria-label="Score views">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={scoreTab === tab.id ? styles.scoreTabActive : styles.scoreTab}
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
        <div className={styles.notationCard}>
          <div className={styles.notationMeta}>
            <span>♩ = 140</span>
            <span>Swing</span>
            {isDemo && <small>Clearly labeled demo score · click a measure to seek</small>}
          </div>
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
              onClick={seekFromScore}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className={styles.scoreLoading}>Engraving notation…</div>
          )}
        </div>
      )}

      {scoreTab === "analysis" && (
        <div className={styles.insightGrid}>
          <article>
            <span><Sparkles size={17} /> HARMONIC PATH</span>
            <h3>Minor ii–V into a tonic release</h3>
            <p>The demo phrase targets guide tones through Dm7–G7–Cmaj7. Analysis is deterministic and score-derived.</p>
          </article>
          <article>
            <span><PencilLine size={17} /> PHRASE SHAPE</span>
            <h3>Ascending tension, descending answer</h3>
            <p>Chromatic approaches resolve by step while the rhythmic density relaxes at the cadence.</p>
          </article>
          <article>
            <span><BookOpen size={17} /> VOCABULARY</span>
            <h3>Bebop dominant connection</h3>
            <p>Save the selected measures to compare the same interval pattern in all twelve keys.</p>
          </article>
        </div>
      )}

      {(scoreTab === "practice" || scoreTab === "keys") && (
        <div className={styles.practiceGrid}>
          <div className={styles.practiceIntro}>
            <p className={styles.eyebrow}>TWELVE-KEY PRACTICE</p>
            <h2>Move the phrase through every center.</h2>
            <p>Concert-pitch intervals and rhythm stay fixed. Mark a key when the phrase feels settled.</p>
          </div>
          <div className={styles.keyGrid}>
            {practiceKeys.map((key) => (
              <button
                key={key}
                className={mastered.has(key) ? styles.keyMastered : styles.keyCard}
                onClick={() =>
                  setMastered((current) => {
                    const next = new Set(current);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                type="button"
              >
                <strong>{key}</strong>
                <span>{mastered.has(key) ? "Mastered" : "Practice"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
