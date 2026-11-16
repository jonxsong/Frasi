import { useRef, useState } from "react";
import { FileAudio, Link2, Upload, X } from "lucide-react";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

const ACCEPTED_TYPES = ["audio/wav", "audio/mpeg", "audio/flac", "audio/mp4", "audio/ogg", "audio/x-m4a"];
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
    audio.onerror = () => reject(new Error("The browser could not decode this audio file."));
    audio.src = url;
  });
}

export function NewTranscriptionDialog({ onClose, onNotify }: NewTranscriptionDialogProps) {
  const setAudio = useStudioStore((state) => state.setAudio);
  const [tab, setTab] = useState<"upload" | "link">("upload");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED_EXTENSIONS.test(file.name) || (file.type && !ACCEPTED_TYPES.includes(file.type))) {
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
      const duration = await readDuration(url);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error("Invalid audio duration.");
      setAudio(url, file.name, duration);
      onNotify("Audio loaded — drag the A/B markers to choose your phrase");
      onClose();
    } catch (cause) {
      URL.revokeObjectURL(url);
      setError(cause instanceof Error ? cause.message : "Unable to read this audio file.");
    } finally {
      setBusy(false);
    }
  }

  function handleLink() {
    setError(null);
    let parsed: URL;
    try {
      parsed = new URL(link);
    } catch {
      setError("Enter a valid YouTube or Spotify URL.");
      return;
    }
    const allowed = ["youtube.com", "www.youtube.com", "youtu.be", "open.spotify.com"];
    if (!allowed.includes(parsed.hostname)) {
      setError("Only official YouTube and Spotify links are supported.");
      return;
    }
    onNotify("Link saved for metadata — upload authorized audio to run transcription");
    onClose();
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={onClose}>
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-transcription-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className={styles.dialogClose} onClick={onClose} aria-label="Close" type="button">
          <X size={18} />
        </button>
        <p className={styles.eyebrow}>NEW PROJECT</p>
        <h2 id="new-transcription-title">Bring in a recording</h2>
        <p className={styles.dialogIntro}>
          Upload audio you are permitted to process, or associate an official streaming link for
          metadata and playback.
        </p>
        <div className={styles.dialogTabs} role="tablist" aria-label="Recording source">
          <button
            className={tab === "upload" ? styles.dialogTabActive : styles.dialogTab}
            onClick={() => setTab("upload")}
            role="tab"
            aria-selected={tab === "upload"}
            type="button"
          >
            <FileAudio size={17} /> Audio file
          </button>
          <button
            className={tab === "link" ? styles.dialogTabActive : styles.dialogTab}
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
              <strong>{busy ? "Reading recording…" : "Choose an audio recording"}</strong>
              <small>WAV, MP3, FLAC, M4A, or OGG · up to 200 MB</small>
            </button>
          </>
        ) : (
          <div className={styles.linkForm}>
            <label htmlFor="recording-link">Official track URL</label>
            <div>
              <input
                id="recording-link"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://youtube.com/watch?v=…"
                type="url"
              />
              <button onClick={handleLink} type="button">Add link</button>
            </div>
            <small>
              Frasi never rips protected audio. Upload a recording you are authorized to analyze.
            </small>
          </div>
        )}
        {error && <p className={styles.formError}>{error}</p>}
      </section>
    </div>
  );
}
