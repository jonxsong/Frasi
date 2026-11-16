"use client";

import { useCallback } from "react";
import { toWrittenPartMusicXml } from "@/lib/musicXml";
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
  const instrument = useStudioStore((state) => state.instrument);
  const transposeSemitones = useStudioStore(
    (state) => state.transposeSemitones,
  );
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
      if (format === "musicxml") {
        download(
          toWrittenPartMusicXml(musicXml, instrument, transposeSemitones),
          `${stem}-tenor-bb.musicxml`,
          "application/vnd.recordare.musicxml+xml",
        );
        notify("Tenor B♭ MusicXML export downloaded");
        return;
      }
      if (!projectId) {
        notify(
          "Run a transcription to generate server-backed MIDI and PDF exports",
        );
        return;
      }
      try {
        const blob = await apiDownload(
          `/api/v1/transcriptions/${projectId}/export/${format}`,
        );
        const suffix = format === "midi" ? "mid" : format;
        download(blob, `${stem}.${suffix}`, blob.type);
        notify(`${format.toUpperCase()} export downloaded`);
      } catch (cause) {
        notify(cause instanceof ApiError ? cause.message : "Export failed");
      }
    },
    [instrument, musicXml, notify, projectId, projectTitle, transposeSemitones],
  );

  return { save, share, exportScore };
}
