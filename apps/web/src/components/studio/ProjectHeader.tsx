import { Bookmark, Download, MoreHorizontal, Plus, Share2 } from "lucide-react";
import { useState } from "react";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

interface ProjectHeaderProps {
  onNew: () => void;
  onSave: () => void;
  onShare: () => void;
  onExport: (format: "musicxml" | "midi" | "pdf") => void;
}

export function ProjectHeader({
  onNew,
  onSave,
  onShare,
  onExport,
}: ProjectHeaderProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const audioName = useStudioStore((state) => state.audioName);
  const isDemo = useStudioStore((state) => state.isDemo);
  const savedAt = useStudioStore((state) => state.savedAt);
  const projectTitle = useStudioStore((state) => state.projectTitle);
  const projectArtist = useStudioStore((state) => state.projectArtist);
  const jobStatus = useStudioStore((state) => state.jobStatus);
  const jobStage = useStudioStore((state) => state.jobStage);
  const jobProgress = useStudioStore((state) => state.jobProgress);

  return (
    <section
      className={styles.projectHeader}
      aria-label="Current transcription"
    >
      <div className={styles.trackCopy}>
        <div className={styles.trackTitleRow}>
          <h1>
            {projectTitle ??
              (audioName
                ? audioName.replace(/\.[^.]+$/, "")
                : "Midnight Language — Tenor Solo")}
          </h1>
          {isDemo && <span className={styles.demoBadge}>DEMO SCORE</span>}
          {["queued", "processing"].includes(jobStatus) && (
            <span className={styles.jobBadge}>
              {Math.round(jobProgress * 100)}% ·{" "}
              {jobStage?.replaceAll("_", " ")}
            </span>
          )}
        </div>
        <p>
          {projectArtist ??
            (audioName ? "Your authorized audio" : "Frasi Session Players")}
          <span>·</span>
          {audioName ? "Uploaded recording" : "2026"}
          <span>·</span>
          Tenor Saxophone in B♭
        </p>
      </div>
      <div className={styles.projectActions}>
        <button
          className={styles.actionButtonWide}
          onClick={onNew}
          type="button"
        >
          <Plus size={18} /> New Transcription
        </button>
        <button className={styles.actionButton} onClick={onSave} type="button">
          <Bookmark size={17} fill={savedAt ? "currentColor" : "none"} />
          <span>{savedAt ? "Saved" : "Save"}</span>
        </button>
        <button className={styles.actionButton} onClick={onShare} type="button">
          <Share2 size={17} /> <span>Share</span>
        </button>
        <div className={styles.exportControl}>
          <button
            className={styles.actionButton}
            onClick={() => setExportOpen((value) => !value)}
            aria-expanded={exportOpen}
            type="button"
          >
            <Download size={17} /> <span>Export</span>
          </button>
          {exportOpen && (
            <div className={styles.exportMenu}>
              {(["pdf", "musicxml", "midi"] as const).map((format) => (
                <button
                  key={format}
                  onClick={() => {
                    setExportOpen(false);
                    onExport(format);
                  }}
                  type="button"
                >
                  {format === "musicxml" ? "MusicXML" : format.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className={styles.actionSquare}
          aria-label="More project actions"
          type="button"
        >
          <MoreHorizontal size={19} />
        </button>
      </div>
    </section>
  );
}
