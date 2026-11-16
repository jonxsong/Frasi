import {
  Expand,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import { formatTime } from "@/lib/time";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

export function Transport() {
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const currentTime = useStudioStore((state) => state.currentTime);
  const duration = useStudioStore((state) => state.duration);
  const volume = useStudioStore((state) => state.volume);
  const togglePlaying = useStudioStore((state) => state.togglePlaying);
  const setCurrentTime = useStudioStore((state) => state.setCurrentTime);
  const setVolume = useStudioStore((state) => state.setVolume);

  const seek = (seconds: number) =>
    setCurrentTime(Math.max(0, Math.min(duration, seconds)));

  return (
    <footer className={styles.transport} aria-label="Playback transport">
      <button
        onClick={() => seek(currentTime - 5)}
        aria-label="Back five seconds"
        type="button"
      >
        <SkipBack size={20} fill="currentColor" />
      </button>
      <button
        className={styles.transportPlay}
        onClick={togglePlaying}
        aria-label={isPlaying ? "Pause" : "Play"}
        type="button"
      >
        {isPlaying ? (
          <Pause size={21} fill="currentColor" />
        ) : (
          <Play size={21} fill="currentColor" />
        )}
      </button>
      <button
        onClick={() => seek(currentTime + 5)}
        aria-label="Forward five seconds"
        type="button"
      >
        <SkipForward size={20} fill="currentColor" />
      </button>
      <span className={styles.transportTime}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <input
        className={styles.seekRange}
        type="range"
        min={0}
        max={Math.max(duration, 1)}
        step={0.01}
        value={Math.min(currentTime, duration)}
        onChange={(event) => seek(Number(event.target.value))}
        aria-label="Playback position"
        style={
          {
            "--range-progress": `${(currentTime / Math.max(duration, 1)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <button
        onClick={() => setVolume(volume === 0 ? 0.8 : 0)}
        aria-label={volume === 0 ? "Unmute" : "Mute"}
        type="button"
      >
        {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
      <input
        className={styles.volumeRange}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(event) => setVolume(Number(event.target.value))}
        aria-label="Volume"
        style={
          { "--range-progress": `${volume * 100}%` } as React.CSSProperties
        }
      />
      <button
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen();
        }}
        aria-label="Toggle fullscreen"
        type="button"
      >
        <Expand size={20} />
      </button>
    </footer>
  );
}
