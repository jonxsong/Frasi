import type { InstrumentId } from "@frasi/shared-types";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEMO_MUSIC_XML } from "@/lib/demoScore";

export type Workspace = "transcribe" | "practice" | "library" | "explore";
export type PitchView = "concert" | "instrument";
export type PlaybackMode = "recording" | "isolated" | "synth" | "rhythm";

interface StudioState {
  workspace: Workspace;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  selectionStart: number;
  selectionEnd: number;
  loopEnabled: boolean;
  speed: number;
  volume: number;
  pitchView: PitchView;
  transposeSemitones: number;
  transposeKey: string;
  instrument: InstrumentId;
  chordAnalysis: boolean;
  scoreTab: "score" | "analysis" | "practice" | "keys";
  playbackMode: PlaybackMode;
  musicXml: string;
  audioUrl: string | null;
  audioName: string | null;
  isDemo: boolean;
  savedAt: number | null;
  recordingId: string | null;
  recordingSource: "upload" | "youtube" | "spotify" | null;
  projectId: string | null;
  revisionId: string | null;
  jobId: string | null;
  jobStatus: "idle" | "queued" | "processing" | "succeeded" | "failed";
  jobStage: string | null;
  jobProgress: number;
  projectTitle: string | null;
  projectArtist: string | null;
  setWorkspace: (workspace: Workspace) => void;
  setPlaying: (playing: boolean) => void;
  togglePlaying: () => void;
  setCurrentTime: (seconds: number) => void;
  setDuration: (seconds: number) => void;
  setSelection: (start: number, end: number) => void;
  setLoopEnabled: (enabled: boolean) => void;
  setSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  setPitchView: (view: PitchView) => void;
  setTranspose: (semitones: number, key: string) => void;
  setInstrument: (instrument: InstrumentId) => void;
  setChordAnalysis: (enabled: boolean) => void;
  setScoreTab: (tab: StudioState["scoreTab"]) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  setAudio: (url: string, name: string, duration: number) => void;
  setMusicXml: (musicXml: string) => void;
  setRecording: (
    id: string,
    source: "upload" | "youtube" | "spotify",
    title: string,
    artist: string | null,
  ) => void;
  setRemoteProject: (projectId: string, jobId: string) => void;
  setJob: (
    status: StudioState["jobStatus"],
    stage: string | null,
    progress: number,
  ) => void;
  setRevision: (revisionId: string, musicXml: string) => void;
  markSaved: () => void;
  resetProject: () => void;
}

const initialState = {
  workspace: "transcribe" as const,
  isPlaying: false,
  currentTime: 135,
  duration: 320,
  selectionStart: 135,
  selectionEnd: 185,
  loopEnabled: true,
  speed: 1,
  volume: 0.8,
  pitchView: "concert" as const,
  transposeSemitones: 0,
  transposeKey: "C (Original)",
  instrument: "tenor_saxophone" as const,
  chordAnalysis: true,
  scoreTab: "score" as const,
  playbackMode: "recording" as const,
  musicXml: DEMO_MUSIC_XML,
  audioUrl: null,
  audioName: null,
  isDemo: true,
  savedAt: null,
  recordingId: null,
  recordingSource: null,
  projectId: null,
  revisionId: null,
  jobId: null,
  jobStatus: "idle" as const,
  jobStage: null,
  jobProgress: 0,
  projectTitle: null,
  projectArtist: null,
};

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      ...initialState,
      setWorkspace: (workspace) => set({ workspace }),
      setPlaying: (isPlaying) => set({ isPlaying }),
      togglePlaying: () => set((state) => ({ isPlaying: !state.isPlaying })),
      setCurrentTime: (currentTime) => set({ currentTime }),
      setDuration: (duration) => set({ duration }),
      setSelection: (selectionStart, selectionEnd) => set({ selectionStart, selectionEnd }),
      setLoopEnabled: (loopEnabled) => set({ loopEnabled }),
      setSpeed: (speed) => set({ speed: Math.max(0.25, Math.min(2, speed)) }),
      setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
      setPitchView: (pitchView) => set({ pitchView }),
      setTranspose: (transposeSemitones, transposeKey) =>
        set({ transposeSemitones, transposeKey }),
      setInstrument: (instrument) => set({ instrument }),
      setChordAnalysis: (chordAnalysis) => set({ chordAnalysis }),
      setScoreTab: (scoreTab) => set({ scoreTab }),
      setPlaybackMode: (playbackMode) => set({ playbackMode }),
      setAudio: (audioUrl, audioName, duration) =>
        set({
          audioUrl,
          audioName,
          duration,
          currentTime: 0,
          selectionStart: 0,
          selectionEnd: Math.min(duration, 30),
          isDemo: false,
          isPlaying: false,
        }),
      setMusicXml: (musicXml) => set({ musicXml, isDemo: false }),
      setRecording: (recordingId, recordingSource, projectTitle, projectArtist) =>
        set({ recordingId, recordingSource, projectTitle, projectArtist }),
      setRemoteProject: (projectId, jobId) =>
        set({ projectId, jobId, jobStatus: "queued", jobStage: "waiting_for_worker", jobProgress: 0 }),
      setJob: (jobStatus, jobStage, jobProgress) => set({ jobStatus, jobStage, jobProgress }),
      setRevision: (revisionId, musicXml) =>
        set({ revisionId, musicXml, isDemo: false, jobStatus: "succeeded", jobProgress: 1 }),
      markSaved: () => set({ savedAt: Date.now() }),
      resetProject: () => set({ ...initialState, savedAt: null }),
    }),
    {
      name: "frasi-studio",
      partialize: (state) => ({
        speed: state.speed,
        volume: state.volume,
        pitchView: state.pitchView,
        transposeSemitones: state.transposeSemitones,
        transposeKey: state.transposeKey,
        instrument: state.instrument,
        chordAnalysis: state.chordAnalysis,
        loopEnabled: state.loopEnabled,
      }),
    },
  ),
);
