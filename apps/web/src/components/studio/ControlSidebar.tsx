import { KeyboardMusic, Minus, Plus } from "lucide-react";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label className={styles.toggleRow}>
      <button
        className={checked ? styles.switchOn : styles.switch}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span />
      </button>
      <span>{label}</span>
    </label>
  );
}

export function ControlSidebar() {
  const speed = useStudioStore((state) => state.speed);
  const loopEnabled = useStudioStore((state) => state.loopEnabled);
  const playbackMode = useStudioStore((state) => state.playbackMode);
  const setSpeed = useStudioStore((state) => state.setSpeed);
  const setLoopEnabled = useStudioStore((state) => state.setLoopEnabled);
  const setPlaybackMode = useStudioStore((state) => state.setPlaybackMode);
  const setScoreTab = useStudioStore((state) => state.setScoreTab);

  return (
    <aside
      className={styles.controlSidebar}
      aria-label="Playback and transcription controls"
    >
      <section className={styles.controlSection}>
        <label>Written part</label>
        <div className={styles.writtenPartCard}>
          <strong>Tenor Saxophone</strong>
          <span>B♭</span>
        </div>
        <small>
          B♭ pitch in a practical staff register; genuine altissimo stays high
        </small>
      </section>
      <section className={styles.speedRow}>
        <span>Playback</span>
        <div>
          <button
            onClick={() => setSpeed(speed - 0.05)}
            aria-label="Decrease speed"
            type="button"
          >
            <Minus size={15} />
          </button>
          <output>{speed.toFixed(2)}×</output>
          <button
            onClick={() => setSpeed(speed + 0.05)}
            aria-label="Increase speed"
            type="button"
          >
            <Plus size={15} />
          </button>
        </div>
      </section>
      <div className={styles.controlDivider} />
      <Toggle
        label="Loop Selection (A–B)"
        checked={loopEnabled}
        onChange={setLoopEnabled}
      />
      <section className={styles.controlSection}>
        <label htmlFor="playback-mode">Playback source</label>
        <select
          id="playback-mode"
          value={playbackMode}
          onChange={(event) =>
            setPlaybackMode(event.target.value as typeof playbackMode)
          }
        >
          <option value="recording">Original recording</option>
          <option value="isolated">Solo isolated</option>
          <option value="synth">Synthesized notation</option>
          <option value="rhythm">Rhythm only</option>
        </select>
      </section>
      <button
        className={styles.allKeysButton}
        onClick={() => setScoreTab("practice")}
        type="button"
      >
        <KeyboardMusic size={20} /> Practice in All 12 Keys
      </button>
    </aside>
  );
}
