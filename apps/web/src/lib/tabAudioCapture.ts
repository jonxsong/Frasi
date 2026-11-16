export type StreamingProvider = "youtube" | "spotify";

export interface StreamingReference {
  provider: StreamingProvider;
  url: string;
}

export interface TabAudioCaptureSession {
  result: Promise<{
    file: File;
    durationSeconds: number;
  }>;
  stop: () => void;
}

const STREAMING_HOSTS: Record<string, StreamingProvider> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "music.youtube.com": "youtube",
  "youtu.be": "youtube",
  "open.spotify.com": "spotify",
};

export function parseStreamingReference(
  value: string,
): StreamingReference | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    const provider = STREAMING_HOSTS[url.hostname.toLowerCase()];
    return provider ? { provider, url: url.toString() } : null;
  } catch {
    return null;
  }
}

function captureMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm"].find((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

/**
 * Record only the audio track from a browser-mediated display capture. The
 * caller never receives video and the bounded recording remains in memory.
 */
export async function startTabAudioCapture(
  filename: string,
  maximumMilliseconds = 20_000,
): Promise<TabAudioCaptureSession> {
  if (!navigator.mediaDevices?.getDisplayMedia)
    throw new Error("This browser does not support tab-audio capture.");
  if (typeof MediaRecorder === "undefined")
    throw new Error("This browser cannot record a shared tab's audio.");

  const sharedStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: true,
  });
  const audioTrack = sharedStream.getAudioTracks()[0];
  if (!audioTrack) {
    sharedStream.getTracks().forEach((track) => track.stop());
    throw new Error(
      "No tab audio was shared. Choose a browser tab and enable Share tab audio.",
    );
  }

  const audioStream = new MediaStream([audioTrack]);
  const mimeType = captureMimeType();
  const recorder = new MediaRecorder(
    audioStream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: BlobPart[] = [];
  let startedAt = 0;
  let timeout = 0;
  let settled = false;

  function cleanUp() {
    window.clearTimeout(timeout);
    sharedStream.getTracks().forEach((track) => track.stop());
  }

  const result = new Promise<{
    file: File;
    durationSeconds: number;
  }>((resolve, reject) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      reject(new Error("The browser could not capture audio from that tab."));
    };
    recorder.onstop = () => {
      if (settled) return;
      settled = true;
      cleanUp();
      const type = recorder.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      if (!blob.size) {
        reject(
          new Error(
            "The shared tab produced no audio. Start playback before capturing.",
          ),
        );
        return;
      }
      resolve({
        file: new File([blob], filename, { type }),
        durationSeconds: Math.max(
          0.001,
          (performance.now() - startedAt) / 1_000,
        ),
      });
    };
  });

  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  audioTrack.addEventListener("ended", stop, { once: true });
  startedAt = performance.now();
  recorder.start(250);
  timeout = window.setTimeout(stop, maximumMilliseconds);
  return { result, stop };
}
