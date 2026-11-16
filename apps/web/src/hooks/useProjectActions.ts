"use client";

import { useCallback } from "react";
import { useStudioStore } from "@/store/studio";

function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function useProjectActions(notify: (message: string) => void) {
  const musicXml = useStudioStore((state) => state.musicXml);
  const markSaved = useStudioStore((state) => state.markSaved);

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

  const exportMusicXml = useCallback(() => {
    download(musicXml, "frasi-transcription.musicxml", "application/vnd.recordare.musicxml+xml");
    notify("MusicXML export downloaded");
  }, [musicXml, notify]);

  return { save, share, exportMusicXml };
}
