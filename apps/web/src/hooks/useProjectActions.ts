"use client";

import { useCallback } from "react";
import { useStudioStore } from "@/store/studio";
import { ApiError, apiDownload } from "@/lib/api";

function download(content: BlobPart | Blob, name: string, type: string) {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useProjectActions(notify: (message: string) => void) {
  const musicXml = useStudioStore((state) => state.musicXml);
  const markSaved = useStudioStore((state) => state.markSaved);
  const projectId = useStudioStore((state) => state.projectId);
  const projectTitle = useStudioStore((state) => state.projectTitle);

  const save = useCallback(() => {
    markSaved();
    notify("Project saved in this browser");
  }, [markSaved, notify]);

  const share = useCallback(async () => {
    const data = {
      title: "Frasi transcription",
      text: "Open this phrase in Frasi — every note, every rhythm, every phrase.",
      url: window.location.href,
    };
    if (navigator.share) {
      await navigator.share(data).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(data.url);
    notify("Share link copied");
  }, [notify]);

  const exportScore = useCallback(
    async (format: "musicxml" | "midi" | "pdf") => {
      const stem = (projectTitle ?? "frasi-transcription").replace(
        /[^a-z0-9_-]+/gi,
        "-",
      );
      if (!projectId) {
        if (format !== "musicxml") {
          notify(
            "Run a transcription to generate server-backed MIDI and PDF exports",
          );
          return;
        }
        download(
          musicXml,
          `${stem}.musicxml`,
          "application/vnd.recordare.musicxml+xml",
        );
        notify("MusicXML export downloaded");
        return;
      }
      try {
        const blob = await apiDownload(
          `/api/v1/transcriptions/${projectId}/export/${format}`,
        );
        const suffix = format === "midi" ? "mid" : format;
        download(blob, `${stem}.${suffix}`, blob.type);
        notify(
          `${format === "musicxml" ? "MusicXML" : format.toUpperCase()} export downloaded`,
        );
      } catch (cause) {
        notify(cause instanceof ApiError ? cause.message : "Export failed");
      }
    },
    [musicXml, notify, projectId, projectTitle],
  );

  return { save, share, exportScore };
}
