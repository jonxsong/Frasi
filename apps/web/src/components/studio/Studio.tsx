"use client";

import { useCallback, useEffect, useState } from "react";
import { useProjectActions } from "@/hooks/useProjectActions";
import { Header } from "./Header";
import { ProjectHeader } from "./ProjectHeader";
import styles from "./Studio.module.css";

export function Studio() {
  const [toast, setToast] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const actions = useProjectActions(notify);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <main className={styles.studio}>
      <Header />
      <div className={styles.workspace}>
        <ProjectHeader
          onNew={() => setNewProjectOpen(true)}
          onSave={actions.save}
          onShare={actions.share}
          onExport={actions.exportMusicXml}
        />
        {newProjectOpen && (
          <button className={styles.placeholderDialog} onClick={() => setNewProjectOpen(false)}>
            New transcription workflow is opening…
          </button>
        )}
      </div>
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
