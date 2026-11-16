import { useEffect, useRef, useState } from "react";
import {
  ExternalLink,
  FileAudio,
  Link2,
  Radio,
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

interface NewTranscriptionDialogProps {
  onClose: () => void;
  onNotify: (message: string) => void;
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
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<TabAudioCaptureSession | null>(null);
  const captureTimerRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      window.clearInterval(captureTimerRef.current);
      captureRef.current?.stop();
    };
  }, []);

  async function handleFile(
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
      setAudio(url, file.name, duration);
      if (options.forceLocal || !accessToken || !API_AVAILABLE) {
        setJob("processing", "decoding_audio", 0.05);
        const result = await transcribeAudioLocally(file, (stage, progress) =>
          setJob("processing", stage, progress),
        );
        setLocalProject(file.name.replace(/\.[^.]+$/, ""), result.musicXml);
        onNotify(
          `Local transcription ready — ${result.noteCount} notes at about ${result.bpm} BPM`,
        );
        onClose();
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("title", file.name.replace(/\.[^.]+$/, ""));
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
            title: `${recording.title} — phrase`,
            instrument_id: instrument,
            segment_start_seconds: 0,
            segment_end_seconds: Math.min(duration, 30),
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
      setRemoteProject(project.id, job.id);
      onNotify(
        "Transcription queued — real pitch and rhythm analysis is running",
      );
      onClose();
    } catch (cause) {
      setJob("failed", "local_error", 0);
      setError(
        cause instanceof ApiError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : "Unable to read this audio file.",
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
        20_000,
      );
      captureRef.current = session;
      setCapturing(true);
      setCaptureSeconds(0);
      setBusy(false);
      captureTimerRef.current = window.setInterval(
        () => setCaptureSeconds((seconds) => Math.min(20, seconds + 1)),
        1_000,
      );
      const { file, durationSeconds } = await session.result;
      window.clearInterval(captureTimerRef.current);
      captureRef.current = null;
      if (!mountedRef.current) return;
      setCapturing(false);
      await handleFile(file, {
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
        <h2 id="new-transcription-title">Bring in a recording</h2>
        <p className={styles.dialogIntro}>
          No account is required. Upload authorized audio for a real local
          monophonic transcription, or capture authorized playback from a
          YouTube or Spotify browser tab.
        </p>
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
          <>
            <input
              ref={inputRef}
              className={styles.srFileInput}
              type="file"
              accept=".wav,.mp3,.flac,.m4a,.ogg,audio/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
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
                  ? "Analyzing the opening phrase…"
                  : "Choose an audio recording"}
              </strong>
              <small>
                WAV, MP3, FLAC, M4A, or OGG · first 20 seconds analyzed locally
              </small>
            </button>
          </>
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
            </div>
            <button
              className={
                capturing ? styles.captureButtonActive : styles.captureButton
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
                ? `Stop & transcribe · ${captureSeconds}s / 20s`
                : "Capture 20 seconds from playing tab"}
            </button>
            <small className={styles.captureNotice}>
              Browser-mediated, real-time capture only. Audio stays in memory
              and is analyzed locally; protected playback may decline capture.
              Use only audio you are authorized to transcribe.
            </small>
          </div>
        )}
        {error && <p className={styles.formError}>{error}</p>}
      </section>
    </div>
  );
}
