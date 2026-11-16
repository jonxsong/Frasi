import { AudioLines, Timer } from "lucide-react";
import styles from "./Studio.module.css";

export function ScoreFooter() {
  return (
    <footer className={styles.scoreFooter}>
      <span>Bars 1–12</span>
      <i />
      <span>Key: D minor (modal)</span>
      <i />
      <span>Tempo: ♩ = 140 (Swing)</span>
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
