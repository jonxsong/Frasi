"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { Pause, Play, Repeat2, RotateCcw } from "lucide-react";
import type WaveSurfer from "wavesurfer.js";
import { formatTime } from "@/lib/time";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

const demoPeaks = Array.from({ length: 190 }, (_, index) => {
  const envelope = Math.sin((index / 189) * Math.PI) * 0.55 + 0.2;
  const texture = Math.abs(Math.sin(index * 1.79) * 0.58 + Math.sin(index * 0.37) * 0.34);
  return Math.max(0.08, Math.min(1, envelope * texture));
});

type DragKind = "start" | "end" | null;

export function Waveform() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<WaveSurfer | null>(null);
  const dragRef = useRef<DragKind>(null);
  const audioUrl = useStudioStore((state) => state.audioUrl);
  const isPlaying = useStudioStore((state) => state.isPlaying);
  const currentTime = useStudioStore((state) => state.currentTime);
  const duration = useStudioStore((state) => state.duration);
  const selectionStart = useStudioStore((state) => state.selectionStart);
  const selectionEnd = useStudioStore((state) => state.selectionEnd);
  const loopEnabled = useStudioStore((state) => state.loopEnabled);
  const speed = useStudioStore((state) => state.speed);
  const volume = useStudioStore((state) => state.volume);
  const togglePlaying = useStudioStore((state) => state.togglePlaying);
  const setPlaying = useStudioStore((state) => state.setPlaying);
  const setCurrentTime = useStudioStore((state) => state.setCurrentTime);
  const setDuration = useStudioStore((state) => state.setDuration);
  const setSelection = useStudioStore((state) => state.setSelection);
  const setLoopEnabled = useStudioStore((state) => state.setLoopEnabled);
  const setSpeed = useStudioStore((state) => state.setSpeed);

  const selectionLeft = (selectionStart / Math.max(duration, 1)) * 100;
  const selectionWidth = ((selectionEnd - selectionStart) / Math.max(duration, 1)) * 100;
  const playheadLeft = (currentTime / Math.max(duration, 1)) * 100;
  const selectionDuration = Math.max(0, selectionEnd - selectionStart);

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
    },
    [duration],
  );

  const moveHandle = useCallback(
    (kind: Exclude<DragKind, null>, nextTime: number) => {
      if (kind === "start") {
        setSelection(Math.max(0, Math.min(nextTime, selectionEnd - 0.25)), selectionEnd);
      } else {
        setSelection(selectionStart, Math.min(duration, Math.max(nextTime, selectionStart + 0.25)));
      }
    },
    [duration, selectionEnd, selectionStart, setSelection],
  );

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (dragRef.current) moveHandle(dragRef.current, timeFromClientX(event.clientX));
    };
    const up = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [moveHandle, timeFromClientX]);

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return;
    let disposed = false;
    let instance: WaveSurfer | null = null;
    void import("wavesurfer.js").then(({ default: WaveSurferModule }) => {
      if (disposed || !containerRef.current) return;
      instance = WaveSurferModule.create({
        container: containerRef.current,
        url: audioUrl,
        height: 58,
        waveColor: "#4e5267",
        progressColor: "#a76be9",
        cursorColor: "#f1d8ff",
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
      });
      waveRef.current = instance;
      instance.on("ready", (seconds) => {
        const state = useStudioStore.getState();
        setDuration(seconds);
        instance?.setPlaybackRate(state.speed);
        instance?.setTime(Math.min(state.currentTime, seconds));
      });
      instance.on("timeupdate", (seconds) => {
        const state = useStudioStore.getState();
        if (state.loopEnabled && seconds >= state.selectionEnd) {
          instance?.setTime(state.selectionStart);
          void instance?.play();
          return;
        }
        state.setCurrentTime(seconds);
      });
      instance.on("play", () => setPlaying(true));
      instance.on("pause", () => setPlaying(false));
      instance.on("finish", () => setPlaying(false));
    });
    return () => {
      disposed = true;
      instance?.destroy();
      waveRef.current = null;
    };
  }, [audioUrl, setDuration, setPlaying]);

  useEffect(() => {
    const wave = waveRef.current;
    if (!wave) return;
    if (isPlaying && !wave.isPlaying()) void wave.play();
    if (!isPlaying && wave.isPlaying()) wave.pause();
  }, [isPlaying]);

  useEffect(() => {
    waveRef.current?.setPlaybackRate(speed);
  }, [speed]);

  useEffect(() => {
    waveRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    const wave = waveRef.current;
    if (wave && Math.abs(wave.getCurrentTime() - currentTime) > 0.3) wave.setTime(currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (audioUrl || !isPlaying) return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const elapsed = ((now - previous) / 1000) * useStudioStore.getState().speed;
      previous = now;
      const state = useStudioStore.getState();
      let next = state.currentTime + elapsed;
      if (state.loopEnabled && next >= state.selectionEnd) next = state.selectionStart;
      if (!state.loopEnabled && next >= state.duration) {
        next = state.duration;
        state.setPlaying(false);
      }
      state.setCurrentTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [audioUrl, isPlaying]);

  const visiblePeaks = useMemo(
    () =>
      demoPeaks.map((peak, index) => (
        <i key={index} style={{ height: `${Math.max(4, peak * 54)}px` }} />
      )),
    [],
  );

  function seek(seconds: number) {
    setCurrentTime(seconds);
    waveRef.current?.setTime(seconds);
  }

  function handleKey(kind: Exclude<DragKind, null>, event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const change = event.key === "ArrowLeft" ? -0.25 : 0.25;
    moveHandle(kind, (kind === "start" ? selectionStart : selectionEnd) + change);
  }

  return (
    <section className={styles.waveformRow} aria-label="Recording waveform">
      <button className={styles.wavePlay} onClick={togglePlaying} type="button" aria-label={isPlaying ? "Pause" : "Play"}>
        {isPlaying ? <Pause size={23} fill="currentColor" /> : <Play size={23} fill="currentColor" />}
      </button>
      <span className={styles.waveTime}>{formatTime(currentTime)} / {formatTime(duration)}</span>
      <div
        ref={trackRef}
        className={styles.waveTrack}
        onPointerDown={(event) => seek(timeFromClientX(event.clientX))}
      >
        <div ref={containerRef} className={audioUrl ? styles.realWave : styles.hiddenWave} />
        {!audioUrl && <div className={styles.demoWave}>{visiblePeaks}</div>}
        <div
          className={styles.waveSelection}
          style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}
        />
        <span className={styles.selectionLabel} style={{ left: `${selectionLeft + selectionWidth / 2}%` }}>
          {formatTime(selectionDuration, true)}
        </span>
        <button
          className={styles.waveHandle}
          style={{ left: `${selectionLeft}%` }}
          onPointerDown={(event) => {
            event.stopPropagation();
            dragRef.current = "start";
            document.body.style.cursor = "ew-resize";
          }}
          onKeyDown={(event) => handleKey("start", event)}
          role="slider"
          aria-label="Selection start"
          aria-valuemin={0}
          aria-valuemax={selectionEnd}
          aria-valuenow={selectionStart}
          type="button"
        />
        <button
          className={styles.waveHandle}
          style={{ left: `${selectionLeft + selectionWidth}%` }}
          onPointerDown={(event) => {
            event.stopPropagation();
            dragRef.current = "end";
            document.body.style.cursor = "ew-resize";
          }}
          onKeyDown={(event) => handleKey("end", event)}
          role="slider"
          aria-label="Selection end"
          aria-valuemin={selectionStart}
          aria-valuemax={duration}
          aria-valuenow={selectionEnd}
          type="button"
        />
        <span className={styles.wavePlayhead} style={{ left: `${playheadLeft}%` }} />
      </div>
      <div className={styles.waveActions}>
        <button onClick={() => seek(selectionStart)} aria-label="Return to selection start" type="button">
          <RotateCcw size={17} />
        </button>
        <button
          className={loopEnabled ? styles.waveActionActive : undefined}
          onClick={() => setLoopEnabled(!loopEnabled)}
          aria-pressed={loopEnabled}
          aria-label="Loop A to B selection"
          type="button"
        >
          <Repeat2 size={16} /> <span>A–B</span>
        </button>
        <button
          onClick={() => {
            const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
            const index = speeds.indexOf(speed);
            setSpeed(speeds[(index + 1) % speeds.length] ?? 1);
          }}
          aria-label={`Playback speed ${speed} times`}
          type="button"
        >
          {speed.toFixed(speed % 1 ? 2 : 1)}×
        </button>
      </div>
    </section>
  );
}
