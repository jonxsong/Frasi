"use client";

import { AudioLines, Timer } from "lucide-react";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

export function ScoreFooter() {
  const musicXml = useStudioStore((state) => state.musicXml);
  const isDemo = useStudioStore((state) => state.isDemo);
  const tempoBpm = useStudioStore((state) => state.tempoBpm);
  const feel = useStudioStore((state) => state.feel);
  const measureCount = musicXml?.match(/<measure\b/g)?.length ?? 1;
  const keyLabel = isDemo ? "D minor (modal)" : "Not analyzed";

  return (
    <footer className={styles.scoreFooter}>
      <span>Bars 1–{measureCount}</span>
      <i />
      <span>Key: {keyLabel}</span>
      <i />
      <span>
        Tempo: ♩ = {tempoBpm} ({feel})
      </span>
      <div>
        <button aria-label="Audio alignment settings" type="button">
          <AudioLines size={18} />
        </button>
        <button aria-label="Metronome settings" type="button">
          <Timer size={18} />
        </button>
      </div>
    </footer>
  );
}
