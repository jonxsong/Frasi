import { KeyboardMusic, Minus, Plus } from "lucide-react";
import { instruments } from "@frasi/music-core";
import type { InstrumentId } from "@frasi/shared-types";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

const keys = [
  ["C (Original)", 0], ["Db", 1], ["D", 2], ["Eb", 3], ["E", 4], ["F", 5],
  ["Gb", 6], ["G", 7], ["Ab", 8], ["A", 9], ["Bb", 10], ["B", 11],
] as const;

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
  const pitchView = useStudioStore((state) => state.pitchView);
  const transposeSemitones = useStudioStore((state) => state.transposeSemitones);
  const transposeKey = useStudioStore((state) => state.transposeKey);
  const instrument = useStudioStore((state) => state.instrument);
  const speed = useStudioStore((state) => state.speed);
  const loopEnabled = useStudioStore((state) => state.loopEnabled);
  const chordAnalysis = useStudioStore((state) => state.chordAnalysis);
  const playbackMode = useStudioStore((state) => state.playbackMode);
  const setPitchView = useStudioStore((state) => state.setPitchView);
  const setTranspose = useStudioStore((state) => state.setTranspose);
  const setInstrument = useStudioStore((state) => state.setInstrument);
  const setSpeed = useStudioStore((state) => state.setSpeed);
  const setLoopEnabled = useStudioStore((state) => state.setLoopEnabled);
  const setChordAnalysis = useStudioStore((state) => state.setChordAnalysis);
  const setPlaybackMode = useStudioStore((state) => state.setPlaybackMode);
  const setScoreTab = useStudioStore((state) => state.setScoreTab);

  return (
    <aside className={styles.controlSidebar} aria-label="Notation and playback controls">
      <section>
        <h2>Notation</h2>
        <div className={styles.segmentedControl}>
          <button
            className={pitchView === "concert" ? styles.segmentActive : undefined}
            onClick={() => setPitchView("concert")}
            type="button"
          >
            Concert Pitch
          </button>
          <button
            className={pitchView === "instrument" ? styles.segmentActive : undefined}
            onClick={() => setPitchView("instrument")}
            type="button"
          >
            Instrument Pitch
          </button>
        </div>
      </section>
      <section className={styles.controlSection}>
        <label htmlFor="transpose-key">Transpose</label>
        <select
          id="transpose-key"
          value={transposeSemitones}
          onChange={(event) => {
            const semitones = Number(event.target.value);
            const key = keys.find((entry) => entry[1] === semitones)?.[0] ?? "C";
            setTranspose(semitones, key);
          }}
        >
          {keys.map(([key, semitones]) => <option key={key} value={semitones}>{key}</option>)}
        </select>
        <small>{transposeKey === "C (Original)" ? "Canonical concert score" : `${transposeSemitones} semitones from original`}</small>
      </section>
      <section className={styles.controlSection}>
        <label htmlFor="instrument">Instrument (for playback)</label>
        <select
          id="instrument"
          value={instrument}
          onChange={(event) => setInstrument(event.target.value as InstrumentId)}
        >
          {Object.values(instruments).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </section>
      <section className={styles.speedRow}>
        <span>Playback</span>
        <div>
          <button onClick={() => setSpeed(speed - 0.05)} aria-label="Decrease speed" type="button"><Minus size={15} /></button>
          <output>{speed.toFixed(2)}×</output>
          <button onClick={() => setSpeed(speed + 0.05)} aria-label="Increase speed" type="button"><Plus size={15} /></button>
        </div>
      </section>
      <div className={styles.controlDivider} />
      <Toggle label="Loop Selection (A–B)" checked={loopEnabled} onChange={setLoopEnabled} />
      <Toggle label="Show Chord Analysis" checked={chordAnalysis} onChange={setChordAnalysis} />
      <section className={styles.controlSection}>
        <label htmlFor="playback-mode">Playback source</label>
        <select id="playback-mode" value={playbackMode} onChange={(event) => setPlaybackMode(event.target.value as typeof playbackMode)}>
          <option value="recording">Original recording</option>
          <option value="isolated">Solo isolated</option>
          <option value="synth">Synthesized notation</option>
          <option value="rhythm">Rhythm only</option>
        </select>
      </section>
      <button className={styles.allKeysButton} onClick={() => setScoreTab("keys")} type="button">
        <KeyboardMusic size={20} /> Practice in All 12 Keys
      </button>
    </aside>
  );
}
