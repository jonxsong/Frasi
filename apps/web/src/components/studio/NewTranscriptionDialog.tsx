import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileAudio,
  Link2,
  Radio,
  Scissors,
  Square,
  Upload,
  X,
} from "lucide-react";
import { useStudioStore } from "@/store/studio";
import { useAuthStore } from "@/store/auth";
import {
  API_AVAILABLE,
  ApiError,
  apiFetch,
  type JobResponse,
  type ProjectResponse,
  type RecordingResponse,
} from "@/lib/api";
import { transcribeAudioLocally } from "@/lib/localTranscription";
import {
  parseStreamingReference,
  startTabAudioCapture,
  type TabAudioCaptureSession,
} from "@/lib/tabAudioCapture";
import { formatTime } from "@/lib/time";
import styles from "./Studio.module.css";

const ACCEPTED_TYPES = [
  "audio/wav",
  "audio/mpeg",
  "audio/flac",
  "audio/mp4",
  "audio/ogg",
  "audio/x-m4a",
];
const ACCEPTED_EXTENSIONS = /\.(wav|mp3|flac|m4a|ogg)$/i;
const MAX_BYTES = 200 * 1024 * 1024;
const MAX_SELECTION_SECONDS = 10 * 60;
const MAX_CAPTURE_MILLISECONDS = MAX_SELECTION_SECONDS * 1_000;

interface NewTranscriptionDialogProps {
  onClose: () => void;
  onNotify: (message: string) => void;
}

interface PendingAudio {
  file: File;
  url: string;
  duration: number;
  forceLocal: boolean;
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () =>
      reject(new Error("The browser could not decode this audio file."));
    audio.src = url;
  });
}

export function NewTranscriptionDialog({
  onClose,
  onNotify,
}: NewTranscriptionDialogProps) {
  const setAudio = useStudioStore((state) => state.setAudio);
  const setSelection = useStudioStore((state) => state.setSelection);
  const instrument = useStudioStore((state) => state.instrument);
  const existingRecordingId = useStudioStore((state) => state.recordingId);
  const recordingSource = useStudioStore((state) => state.recordingSource);
  const setRecording = useStudioStore((state) => state.setRecording);
  const setRemoteProject = useStudioStore((state) => state.setRemoteProject);
  const setLocalProject = useStudioStore((state) => state.setLocalProject);
  const setJob = useStudioStore((state) => state.setJob);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureSeconds, setCaptureSeconds] = useState(0);
  const [pendingAudio, setPendingAudio] = useState<PendingAudio | null>(null);
  const [selectionStart, setSelectionStart] = useState(0);
  const [selectionEnd, setSelectionEnd] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLAudioElement>(null);
  const captureRef = useRef<TabAudioCaptureSession | null>(null);
  const captureTimerRef = useRef(0);
  const mountedRef = useRef(true);
  const adoptedUrlRef = useRef<string | null>(null);
  const pendingUrlRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearInterval(captureTimerRef.current);
      captureRef.current?.stop();
      if (
        pendingUrlRef.current &&
        pendingUrlRef.current !== adoptedUrlRef.current
      ) {
        URL.revokeObjectURL(pendingUrlRef.current);
      }
    };
  }, []);

  function replacePendingAudio(next: PendingAudio | null) {
    if (
      pendingUrlRef.current &&
      pendingUrlRef.current !== adoptedUrlRef.current
    ) {
      URL.revokeObjectURL(pendingUrlRef.current);
    }
    pendingUrlRef.current = next?.url ?? null;
    setPendingAudio(next);
  }

  async function prepareFile(
    file: File,
    options: {
      skipValidation?: boolean;
      forceLocal?: boolean;
      durationSeconds?: number;
    } = {},
  ) {
    setError(null);
    if (
      !options.skipValidation &&
      (!ACCEPTED_EXTENSIONS.test(file.name) ||
        (file.type && !ACCEPTED_TYPES.includes(file.type)))
    ) {
      setError("Choose a WAV, MP3, FLAC, M4A, or OGG recording.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("This file is larger than the 200 MB browser upload limit.");
      return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const duration = options.durationSeconds ?? (await readDuration(url));
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("Invalid audio duration.");
      replacePendingAudio({
        file,
        url,
        duration,
        forceLocal: Boolean(options.forceLocal),
      });
      setSelectionStart(0);
      setSelectionEnd(Math.min(duration, MAX_SELECTION_SECONDS));
    } catch (cause) {
      URL.revokeObjectURL(url);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to read this audio file.",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateSelectionStart(value: number) {
    if (!pendingAudio) return;
    const next = Math.max(
      0,
      Math.min(value, pendingAudio.duration - 0.1, selectionEnd - 0.1),
    );
    setSelectionStart(next);
  }

  function updateSelectionEnd(value: number) {
    if (!pendingAudio) return;
    const next = Math.min(
      pendingAudio.duration,
      Math.max(value, selectionStart + 0.1),
    );
    setSelectionEnd(next);
  }

  async function transcribeSelection() {
    if (!pendingAudio) return;
    setError(null);
    const selectedDuration = selectionEnd - selectionStart;
    if (selectedDuration < 0.15) {
      setError("Select at least 0.15 seconds of audio.");
      return;
    }
    if (selectedDuration > MAX_SELECTION_SECONDS + 0.01) {
      setError("Choose a selection up to 10 minutes long.");
      return;
    }

    setBusy(true);
    try {
      if (pendingAudio.forceLocal || !accessToken || !API_AVAILABLE) {
        setJob("processing", "loading_pitch_model", 0.05);
        const result = await transcribeAudioLocally(
          pendingAudio.file,
          (stage, progress) => setJob("processing", stage, progress),
          { startSeconds: selectionStart, endSeconds: selectionEnd },
        );
        setAudio(
          pendingAudio.url,
          pendingAudio.file.name,
          pendingAudio.duration,
        );
        setSelection(selectionStart, selectionEnd);
        adoptedUrlRef.current = pendingAudio.url;
        setLocalProject(
          pendingAudio.file.name.replace(/\.[^.]+$/, ""),
          result.musicXml,
          result.bpm,
        );
        onNotify(
          `Selected range transcribed — ${result.noteCount} lead notes at about ${result.bpm} BPM`,
        );
        onClose();
        return;
      }

      const form = new FormData();
      form.append("file", pendingAudio.file);
      form.append("title", pendingAudio.file.name.replace(/\.[^.]+$/, ""));
      const recording = await apiFetch<RecordingResponse>(
        existingRecordingId && recordingSource && recordingSource !== "upload"
          ? `/api/v1/recordings/${existingRecordingId}/audio`
          : "/api/v1/recordings",
        { method: "POST", body: form },
      );
      setRecording(
        recording.id,
        recording.source_kind,
        recording.title,
        recording.artist,
      );
      const project = await apiFetch<ProjectResponse>(
        "/api/v1/transcriptions",
        {
          method: "POST",
          body: JSON.stringify({
            recording_id: recording.id,
            title: `${recording.title} — selected phrase`,
            instrument_id: instrument,
            segment_start_seconds: selectionStart,
            segment_end_seconds: selectionEnd,
          }),
        },
      );
      const job = await apiFetch<JobResponse>(
        `/api/v1/transcriptions/${project.id}/process`,
        {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        },
      );
      setAudio(pendingAudio.url, pendingAudio.file.name, pendingAudio.duration);
      setSelection(selectionStart, selectionEnd);
      adoptedUrlRef.current = pendingAudio.url;
      setRemoteProject(project.id, job.id);
      onNotify("Selected range queued for backend transcription");
      onClose();
    } catch (cause) {
      setJob("failed", "local_error", 0);
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to transcribe the selected audio.",
      );
    } finally {
      setBusy(false);
    }
  }

  function openStreamingReference() {
    setError(null);
    const reference = parseStreamingReference(link);
    if (!reference) {
      setError("Enter a secure YouTube, YouTube Music, or Spotify URL.");
      return;
    }
    window.open(reference.url, "_blank", "noopener,noreferrer");
  }

  async function captureStreamingReference() {
    setError(null);
    const reference = parseStreamingReference(link);
    if (!reference) {
      setError("Enter a secure YouTube, YouTube Music, or Spotify URL.");
      return;
    }
    setBusy(true);
    try {
      const session = await startTabAudioCapture(
        `${reference.provider}-tab-capture.webm`,
        MAX_CAPTURE_MILLISECONDS,
      );
      captureRef.current = session;
      setCapturing(true);
      setCaptureSeconds(0);
      setBusy(false);
      captureTimerRef.current = window.setInterval(
        () => setCaptureSeconds((seconds) => seconds + 1),
        1_000,
      );
      const { file, durationSeconds } = await session.result;
      window.clearInterval(captureTimerRef.current);
      captureRef.current = null;
      if (!mountedRef.current) return;
      setCapturing(false);
      await prepareFile(file, {
        skipValidation: true,
        forceLocal: true,
        durationSeconds,
      });
    } catch (cause) {
      window.clearInterval(captureTimerRef.current);
      captureRef.current = null;
      if (!mountedRef.current) return;
      setCapturing(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to capture audio from that tab.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  const selectedDuration = selectionEnd - selectionStart;

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-transcription-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className={styles.dialogClose}
          onClick={onClose}
          aria-label="Close"
          type="button"
        >
          <X size={18} />
        </button>
        <p className={styles.eyebrow}>NEW PROJECT</p>
        <h2 id="new-transcription-title">
          {pendingAudio ? "Select the phrase" : "Bring in a recording"}
        </h2>
        <p className={styles.dialogIntro}>
          {pendingAudio
            ? "Choose the exact start and end. Frasi analyzes only that range with an on-device pitch model."
            : "No account is required. Upload audio or capture authorized playback from a YouTube or Spotify browser tab."}
        </p>
        <input
          ref={inputRef}
          className={styles.srFileInput}
          type="file"
          accept=".wav,.mp3,.flac,.m4a,.ogg,audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void prepareFile(file);
            event.currentTarget.value = "";
          }}
        />

        {pendingAudio ? (
          <div className={styles.selectionEditor}>
            <div className={styles.selectionFileRow}>
              <span className={styles.dropIcon}>
                <Scissors size={20} />
              </span>
              <span>
                <strong>{pendingAudio.file.name}</strong>
                <small>{formatTime(pendingAudio.duration, true)} total</small>
              </span>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                type="button"
              >
                Replace
              </button>
            </div>
            <audio
              ref={previewRef}
              className={styles.selectionAudio}
              src={pendingAudio.url}
              controls
              preload="metadata"
            />
            <div className={styles.selectionSummary} aria-live="polite">
              <strong>
                {formatTime(selectionStart, true)} –{" "}
                {formatTime(selectionEnd, true)}
              </strong>
              <span>{formatTime(selectedDuration, true)} selected</span>
            </div>
            <div className={styles.selectionSliders}>
              <label>
                <span>Start</span>
                <input
                  aria-label="Selection start"
                  type="range"
                  min={0}
                  max={pendingAudio.duration}
                  step={0.1}
                  value={selectionStart}
                  onChange={(event) =>
                    updateSelectionStart(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>End</span>
                <input
                  aria-label="Selection end"
                  type="range"
                  min={0}
                  max={pendingAudio.duration}
                  step={0.1}
                  value={selectionEnd}
                  onChange={(event) =>
                    updateSelectionEnd(Number(event.target.value))
                  }
                />
              </label>
            </div>
            <div className={styles.selectionTimes}>
              <label>
                Start (seconds)
                <input
                  aria-label="Selection start time"
                  type="number"
                  min={0}
                  max={selectionEnd - 0.1}
                  step={0.1}
                  value={selectionStart.toFixed(1)}
                  onChange={(event) =>
                    updateSelectionStart(Number(event.target.value))
                  }
                />
              </label>
              <button
                onClick={() =>
                  updateSelectionStart(previewRef.current?.currentTime ?? 0)
                }
                type="button"
              >
                Start at playhead
              </button>
              <label>
                End (seconds)
                <input
                  aria-label="Selection end time"
                  type="number"
                  min={selectionStart + 0.1}
                  max={pendingAudio.duration}
                  step={0.1}
                  value={selectionEnd.toFixed(1)}
                  onChange={(event) =>
                    updateSelectionEnd(Number(event.target.value))
                  }
                />
              </label>
              <button
                onClick={() =>
                  updateSelectionEnd(
                    previewRef.current?.currentTime ?? pendingAudio.duration,
                  )
                }
                type="button"
              >
                End at playhead
              </button>
            </div>
            <p className={styles.selectionHint}>
              Up to 10 minutes per pass. For the cleanest lead sheet, choose a
              passage where the solo instrument is clearly isolated.
            </p>
            <button
              className={styles.transcribeSelectionButton}
              onClick={() => void transcribeSelection()}
              disabled={busy}
              type="button"
            >
              {busy
                ? "Transcribing selected audio…"
                : `Transcribe ${formatTime(selectedDuration, true)} selection`}
            </button>
          </div>
        ) : (
          <>
            <div
              className={styles.dialogTabs}
              role="tablist"
              aria-label="Recording source"
            >
              <button
                className={
                  tab === "upload" ? styles.dialogTabActive : styles.dialogTab
                }
                onClick={() => setTab("upload")}
                role="tab"
                aria-selected={tab === "upload"}
                type="button"
              >
                <FileAudio size={17} /> Audio file
              </button>
              <button
                className={
                  tab === "link" ? styles.dialogTabActive : styles.dialogTab
                }
                onClick={() => setTab("link")}
                role="tab"
                aria-selected={tab === "link"}
                type="button"
              >
                <Link2 size={17} /> YouTube / Spotify
              </button>
            </div>
            {tab === "upload" ? (
              <button
                className={styles.dropZone}
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                type="button"
              >
                <span className={styles.dropIcon}>
                  <Upload size={22} />
                </span>
                <strong>
                  {busy
                    ? "Reading the recording…"
                    : "Choose an audio recording"}
                </strong>
                <small>
                  WAV, MP3, FLAC, M4A, or OGG · then select the exact range
                </small>
              </button>
            ) : (
              <div className={styles.linkForm}>
                <label htmlFor="recording-link">YouTube or Spotify URL</label>
                <div>
                  <input
                    id="recording-link"
                    value={link}
                    onChange={(event) => setLink(event.target.value)}
                    placeholder="https://youtube.com/watch?v=…"
                    type="url"
                  />
                  <button
                    onClick={openStreamingReference}
                    disabled={busy || capturing}
                    type="button"
                  >
                    <ExternalLink size={15} /> Open track
                  </button>
                </div>
                <div className={styles.captureSteps}>
                  <span>
                    <b>1</b>
                    <span>Open the track and start playback.</span>
                  </span>
                  <span>
                    <b>2</b>
                    <span>
                      Return here, start capture, select that browser tab, and
                      enable <em>Share tab audio</em>.
                    </span>
                  </span>
                  <span>
                    <b>3</b>
                    <span>Stop capture, then choose the exact phrase.</span>
                  </span>
                </div>
                <button
                  className={
                    capturing
                      ? styles.captureButtonActive
                      : styles.captureButton
                  }
                  onClick={() => {
                    if (capturing) captureRef.current?.stop();
                    else void captureStreamingReference();
                  }}
                  disabled={busy}
                  type="button"
                >
                  {capturing ? (
                    <Square size={15} fill="currentColor" />
                  ) : (
                    <Radio size={17} />
                  )}
                  {capturing
                    ? `Stop capture · ${formatTime(captureSeconds)}`
                    : "Start tab-audio capture"}
                </button>
                <small className={styles.captureNotice}>
                  Capture runs until you stop it (maximum 10 minutes). Audio
                  stays in memory; protected playback may decline capture. Use
                  only audio you are authorized to transcribe.
                </small>
              </div>
            )}
          </>
        )}
        {error && <p className={styles.formError}>{error}</p>}
      </section>
    </div>
  );
}
