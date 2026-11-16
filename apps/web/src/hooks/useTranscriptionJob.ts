"use client";

import { useEffect } from "react";
import { ApiError, apiFetch, type JobResponse, type ScoreResponse } from "@/lib/api";
import { useStudioStore } from "@/store/studio";

export function useTranscriptionJob(notify: (message: string) => void) {
  const jobId = useStudioStore((state) => state.jobId);
  const jobStatus = useStudioStore((state) => state.jobStatus);
  const setJob = useStudioStore((state) => state.setJob);
  const setRevision = useStudioStore((state) => state.setRevision);

  useEffect(() => {
    if (!jobId || !["queued", "processing"].includes(jobStatus)) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const job = await apiFetch<JobResponse>(`/api/v1/jobs/${jobId}`);
        if (!active) return;
        const visibleStatus =
          job.status === "succeeded"
            ? "processing"
            : job.status === "cancelled"
              ? "failed"
              : job.status;
        setJob(visibleStatus, job.stage, job.progress);
        if (job.status === "succeeded") {
          const score = await apiFetch<ScoreResponse>(
            `/api/v1/transcriptions/${job.project_id}/score`,
          );
          if (!active) return;
          setRevision(score.id, score.musicxml);
          notify("Transcription complete — the score is now editable");
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setJob("failed", job.stage, job.progress);
          notify(job.error_message ?? "Transcription could not be completed");
          return;
        }
        timeout = setTimeout(() => void poll(), 1200);
      } catch (cause) {
        if (!active) return;
        setJob("failed", "connection_error", 0);
        notify(cause instanceof ApiError ? cause.message : "Unable to check transcription status");
      }
    }

    void poll();
    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [jobId, jobStatus, notify, setJob, setRevision]);
}
