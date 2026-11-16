import { useEffect, useMemo, useState } from "react";
import { Music2, X } from "lucide-react";
import {
  ApiError,
  apiFetch,
  type ScoreChord,
  type ScoreNote,
  type ScoreResponse,
} from "@/lib/api";
import { useStudioStore } from "@/store/studio";
import styles from "./Studio.module.css";

interface EditableNote extends ScoreNote {
  measure: number;
}

interface EditableChord extends ScoreChord {
  measure: number;
}

interface ScoreCorrectionDialogProps {
  onClose: () => void;
  onNotify: (message: string) => void;
}

export function ScoreCorrectionDialog({
  onClose,
  onNotify,
}: ScoreCorrectionDialogProps) {
  const projectId = useStudioStore((state) => state.projectId);
  const revisionId = useStudioStore((state) => state.revisionId);
  const setRevision = useStudioStore((state) => state.setRevision);
  const [score, setScore] = useState<ScoreResponse | null>(null);
  const [notes, setNotes] = useState<EditableNote[]>([]);
  const [chords, setChords] = useState<EditableChord[]>([]);
  const [summary, setSummary] = useState("Corrected notes and harmony");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    apiFetch<ScoreResponse>(`/api/v1/transcriptions/${projectId}/score`)
      .then((result) => {
        if (!active) return;
        setScore(result);
        setNotes(
          (result.measures ?? []).flatMap((measure) =>
            measure.voices.flatMap((voice) =>
              voice.notes.map((note) => ({ ...note, measure: measure.number })),
            ),
          ),
        );
        setChords(
          (result.measures ?? []).flatMap((measure) =>
            measure.chords.map((chord) => ({
              ...chord,
              measure: measure.number,
            })),
          ),
        );
      })
      .catch(
        (cause) =>
          active &&
          setError(
            cause instanceof ApiError
              ? cause.message
              : "Unable to load score data",
          ),
      )
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [projectId]);

  const originals = useMemo(() => {
    const originalNotes = new Map<string, ScoreNote>();
    const originalChords = new Map<string, ScoreChord>();
    for (const measure of score?.measures ?? []) {
      for (const voice of measure.voices) {
        for (const note of voice.notes) originalNotes.set(note.id, note);
      }
      for (const chord of measure.chords) originalChords.set(chord.id, chord);
    }
    return { originalNotes, originalChords };
  }, [score]);

  function patchNote(id: string, values: Partial<EditableNote>) {
    setNotes((current) =>
      current.map((note) => (note.id === id ? { ...note, ...values } : note)),
    );
  }

  function patchChord(id: string, symbol: string) {
    setChords((current) =>
      current.map((chord) => (chord.id === id ? { ...chord, symbol } : chord)),
    );
  }

  async function save() {
    if (!projectId || !revisionId) return;
    const noteUpdates = notes.flatMap((note) => {
      const original = originals.originalNotes.get(note.id);
      if (!original) return [];
      const changed =
        note.concert_midi !== original.concert_midi ||
        note.spelling !== original.spelling ||
        note.duration_numerator !== original.duration_numerator ||
        note.duration_denominator !== original.duration_denominator ||
        note.articulation !== original.articulation;
      return changed
        ? [
            {
              note_id: note.id,
              concert_midi: note.concert_midi,
              spelling: note.spelling,
              duration_numerator: note.duration_numerator,
              duration_denominator: note.duration_denominator,
              articulation: note.articulation ?? "",
            },
          ]
        : [];
    });
    const chordUpdates = chords.flatMap((chord) => {
      const original = originals.originalChords.get(chord.id);
      return original && chord.symbol !== original.symbol
        ? [
            {
              chord_id: chord.id,
              measure_number: chord.measure,
              beat_numerator: chord.beat_numerator,
              beat_denominator: chord.beat_denominator,
              symbol: chord.symbol,
            },
          ]
        : [];
    });
    if (!noteUpdates.length && !chordUpdates.length) {
      setError(
        "Change a note, duration, articulation, or chord before saving.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<ScoreResponse>(
        `/api/v1/transcriptions/${projectId}/score`,
        {
          method: "PATCH",
          body: JSON.stringify({
            base_revision_id: revisionId,
            edit_summary: summary,
            note_updates: noteUpdates,
            chord_updates: chordUpdates,
          }),
        },
      );
      setRevision(updated.id, updated.musicxml);
      onNotify(`Saved score revision ${updated.revision}`);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : "Unable to save score corrections",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className={`${styles.dialog} ${styles.correctionDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-title"
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
        <p className={styles.eyebrow}>IMMUTABLE SCORE REVISION</p>
        <h2 id="correction-title">Correct the transcription</h2>
        <p className={styles.dialogIntro}>
          Performance timestamps remain intact while symbolic pitch, rhythm,
          articulation, and harmony are revised.
        </p>
        {busy && !score ? (
          <div className={styles.correctionLoading}>
            Loading normalized score…
          </div>
        ) : (
          <div className={styles.correctionBody}>
            <label className={styles.summaryField}>
              Revision note
              <input
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={500}
              />
            </label>
            <div
              className={styles.correctionTable}
              role="table"
              aria-label="Note corrections"
            >
              <div className={styles.correctionHeader} role="row">
                <span>Bar</span>
                <span>Pitch</span>
                <span>MIDI</span>
                <span>Duration</span>
                <span>Articulation</span>
                <span>Source time</span>
              </div>
              {notes
                .filter((note) => !note.is_rest)
                .slice(0, 200)
                .map((note) => (
                  <div
                    className={styles.correctionRow}
                    role="row"
                    key={note.id}
                  >
                    <span>{note.measure}</span>
                    <input
                      value={note.spelling ?? ""}
                      onChange={(event) =>
                        patchNote(note.id, { spelling: event.target.value })
                      }
                      aria-label={`Pitch spelling in bar ${note.measure}`}
                    />
                    <input
                      type="number"
                      min={0}
                      max={127}
                      value={note.concert_midi ?? 60}
                      onChange={(event) =>
                        patchNote(note.id, {
                          concert_midi: Number(event.target.value),
                        })
                      }
                      aria-label={`MIDI pitch in bar ${note.measure}`}
                    />
                    <span className={styles.fractionInput}>
                      <input
                        type="number"
                        min={1}
                        value={note.duration_numerator}
                        onChange={(event) =>
                          patchNote(note.id, {
                            duration_numerator: Number(event.target.value),
                          })
                        }
                        aria-label="Duration numerator"
                      />
                      /
                      <input
                        type="number"
                        min={1}
                        max={64}
                        value={note.duration_denominator}
                        onChange={(event) =>
                          patchNote(note.id, {
                            duration_denominator: Number(event.target.value),
                          })
                        }
                        aria-label="Duration denominator"
                      />
                    </span>
                    <select
                      value={note.articulation ?? ""}
                      onChange={(event) =>
                        patchNote(note.id, {
                          articulation: event.target.value || null,
                        })
                      }
                      aria-label="Articulation"
                    >
                      <option value="">None</option>
                      <option value="accent">Accent</option>
                      <option value="staccato">Staccato</option>
                      <option value="tenuto">Tenuto</option>
                      <option value="marcato">Marcato</option>
                    </select>
                    <small>{note.performance_onset_seconds.toFixed(3)}s</small>
                  </div>
                ))}
            </div>
            <div className={styles.chordEditor}>
              <h3>
                <Music2 size={16} /> Chord symbols
              </h3>
              {chords.length ? (
                chords.map((chord) => (
                  <label key={chord.id}>
                    Bar {chord.measure}
                    <input
                      value={chord.symbol}
                      onChange={(event) =>
                        patchChord(chord.id, event.target.value)
                      }
                    />
                  </label>
                ))
              ) : (
                <p>
                  No chord events yet. Use the analysis suggestions as a
                  starting point.
                </p>
              )}
            </div>
          </div>
        )}
        {error && <p className={styles.formError}>{error}</p>}
        <button
          className={styles.primaryFormButton}
          onClick={() => void save()}
          disabled={busy || !score}
          type="button"
        >
          {busy ? "Saving revision…" : "Save new revision"}
        </button>
      </section>
    </div>
  );
}
