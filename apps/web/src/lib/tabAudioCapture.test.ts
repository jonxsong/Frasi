// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import {
  parseStreamingReference,
  startTabAudioCapture,
} from "./tabAudioCapture";

describe("streaming reference validation", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "youtube"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://music.youtube.com/watch?v=dQw4w9WgXcQ", "youtube"],
    ["https://open.spotify.com/track/example", "spotify"],
  ] as const)("accepts %s", (url, provider) => {
    expect(parseStreamingReference(url)?.provider).toBe(provider);
  });

  it.each([
    "http://youtube.com/watch?v=example",
    "https://youtube.example/watch?v=example",
    "https://example.com/audio",
    "not a url",
  ])("rejects unsupported reference %s", (url) => {
    expect(parseStreamingReference(url)).toBeNull();
  });

  it("returns a bounded in-memory audio file and stops shared tracks", async () => {
    const track = {
      addEventListener: vi.fn(),
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;
    class FakeMediaStream {
      constructor(private readonly tracks: MediaStreamTrack[] = [track]) {}
      getAudioTracks() {
        return this.tracks;
      }
      getTracks() {
        return this.tracks;
      }
    }
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true;
      }
      state: RecordingState = "inactive";
      mimeType = "audio/webm;codecs=opus";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["audio"]) } as BlobEvent);
        this.onstop?.();
      }
    }
    const sharedStream = new FakeMediaStream();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: vi.fn().mockResolvedValue(sharedStream) },
    });
    vi.stubGlobal("MediaStream", FakeMediaStream);
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);

    const session = await startTabAudioCapture("spotify-capture.webm", 5_000);
    session.stop();
    const file = await session.result;

    expect(file.name).toBe("spotify-capture.webm");
    expect(file.size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
