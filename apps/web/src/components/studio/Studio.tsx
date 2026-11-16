"use client";

import { useCallback, useEffect, useState } from "react";
import { useProjectActions } from "@/hooks/useProjectActions";
import { Header } from "./Header";
import { AuthDialog } from "./AuthDialog";
import { NewTranscriptionDialog } from "./NewTranscriptionDialog";
import { ProjectHeader } from "./ProjectHeader";
import { ControlSidebar } from "./ControlSidebar";
import { ScoreFooter } from "./ScoreFooter";
import { ScorePanel } from "./ScorePanel";
import { Transport } from "./Transport";
import { Waveform } from "./Waveform";
import styles from "./Studio.module.css";
import { useTranscriptionJob } from "@/hooks/useTranscriptionJob";

export function Studio() {
  const [toast, setToast] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const notify = useCallback((message: string) => setToast(message), []);
  const actions = useProjectActions(notify);
  useTranscriptionJob(notify);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  return (
    <main className={styles.studio}>
      <Header onAccount={() => setAccountOpen(true)} />
      <div className={styles.workspace}>
        <ProjectHeader
          onNew={() => setNewProjectOpen(true)}
          onSave={actions.save}
          onShare={actions.share}
          onExport={(format) => void actions.exportScore(format)}
        />
        <Waveform />
        <div className={styles.studioGrid}>
          <div className={styles.mainColumn}>
            <ScorePanel onNotify={notify} />
            <ScoreFooter />
          </div>
          <ControlSidebar />
        </div>
      </div>
      {newProjectOpen && (
        <NewTranscriptionDialog
          onClose={() => setNewProjectOpen(false)}
          onNotify={notify}
        />
      )}
      {accountOpen && (
        <AuthDialog onClose={() => setAccountOpen(false)} onNotify={notify} />
      )}
      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
      <Transport />
    </main>
  );
}
