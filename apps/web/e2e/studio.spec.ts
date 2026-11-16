import { expect, test } from "@playwright/test";

function wavFixture(): Buffer {
  const sampleRate = 22_050;
  const segments = [
    { seconds: 0.75, frequency: 220 },
    { seconds: 0.15, frequency: 0 },
    { seconds: 0.75, frequency: 523.25 },
  ];
  const samples = segments.flatMap(({ seconds, frequency }) =>
    Array.from({ length: Math.floor(seconds * sampleRate) }, (_, index) =>
      frequency ? Math.sin((2 * Math.PI * frequency * index) / sampleRate) : 0,
    ),
  );
  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataBytes, 40);
  samples.forEach((sample, index) =>
    wav.writeInt16LE(Math.round(sample * 0x5fff), 44 + index * 2),
  );
  return wav;
}

test("loads the demo studio and opens the compliant ingestion flow", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/frasi/i);
  await expect(
    page.getByLabel("Frasi Jazz Transcription Studio"),
  ).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Midnight Language",
  );
  await expect(page.getByRole("tab", { name: "Score" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("tab", { name: "All 12 Keys" })).toHaveCount(0);
  await expect(page.getByText("Concert Pitch", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Instrument (for playback)")).toHaveCount(0);
  await expect(page.getByText("Written part", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Tenor Saxophone", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("B♭", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Show Chord Analysis" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Loop Selection (A–B)" }),
  ).toBeVisible();
  const score = page.locator('section[aria-label="Interactive score"]');
  await expect(score.locator("svg").first()).toBeVisible({ timeout: 20_000 });
  await expect(score).toContainText("D△7");
  await expect(score).toContainText("E−7");
  await expect(score.locator(".harm")).toHaveCount(12);
  await expect(score.locator(".ledgerLines path")).not.toHaveCount(0);
  await expect
    .poll(() =>
      score
        .locator(".ledgerLines path")
        .first()
        .evaluate((path) => {
          const style = getComputedStyle(path);
          return `${style.strokeWidth} ${style.vectorEffect}`;
        }),
    )
    .toBe("1.5px non-scaling-stroke");

  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Audio file" })).toBeVisible();
  await dialog.getByRole("tab", { name: "YouTube / Spotify" }).click();
  await expect(dialog).toContainText("Start tab-audio capture");
  await expect(dialog).toContainText("Capture runs until you stop it");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("captures and transcribes browser-mediated streaming audio", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  test.skip(
    testInfo.project.name !== "chromium",
    "Tab capture only needs one desktop regression pass.",
  );
  await page.addInitScript((wavBase64) => {
    const wav = Uint8Array.from(atob(wavBase64), (character) =>
      character.charCodeAt(0),
    );
    const track = {
      addEventListener: () => undefined,
      stop: () => undefined,
    };
    class FakeMediaStream {
      constructor(private readonly tracks = [track]) {}
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
      mimeType = "audio/wav";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob([wav], { type: "audio/wav" }),
        } as BlobEvent);
        this.onstop?.();
      }
    }
    Object.defineProperty(window, "MediaStream", {
      configurable: true,
      value: FakeMediaStream,
    });
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: async () => new FakeMediaStream() },
    });
  }, wavFixture().toString("base64"));
  await page.goto("/");
  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "YouTube / Spotify" }).click();
  await dialog
    .getByLabel("YouTube or Spotify URL")
    .fill("https://open.spotify.com/track/frasi-smoke");
  await dialog.getByRole("button", { name: "Start tab-audio capture" }).click();
  await page.waitForTimeout(1_200);
  await dialog.getByRole("button", { name: /Stop capture/ }).click();
  await expect(
    dialog.getByRole("heading", { name: "Select the phrase" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /Transcribe .* selection/ }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "spotify-tab-capture",
  );
  await expect(page.getByText(/Selected range transcribed/)).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("zooms and drag-resizes the score workspace", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Pointer-resize behavior only needs one desktop regression pass.",
  );
  await page.goto("/");
  const score = page.locator('section[aria-label="Interactive score"]');
  await expect(score.locator("svg").first()).toBeVisible({ timeout: 20_000 });
  const zoom = score.getByLabel("Score zoom");
  await expect(zoom).toHaveText("100%");
  await score.getByRole("button", { name: "Zoom out score" }).click();
  await expect(zoom).toHaveText("90%");

  const resizeHandle = score.getByRole("separator", {
    name: "Resize score panel",
  });
  await resizeHandle.scrollIntoViewIfNeeded();
  const card = resizeHandle.locator("..");
  const before = await card.boundingBox();
  await resizeHandle.hover();
  const handleBox = await resizeHandle.boundingBox();
  expect(before).not.toBeNull();
  expect(handleBox).not.toBeNull();
  await page.mouse.down();
  await page.mouse.move(
    (handleBox?.x ?? 0) + (handleBox?.width ?? 0) / 2,
    (handleBox?.y ?? 0) + 110,
    { steps: 4 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await card.boundingBox())?.height ?? 0)
    .toBeGreaterThan((before?.height ?? 0) + 80);
});

test("transcribes an uploaded phrase as a guest without authentication", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name !== "chromium",
    "The browser DSP path only needs one desktop regression pass.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No account is required");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "guest-ledger-phrase.wav",
    mimeType: "audio/wav",
    buffer: wavFixture(),
  });

  await expect(
    dialog.getByRole("heading", { name: "Select the phrase" }),
  ).toBeVisible();
  await dialog.getByLabel("Selection start time").fill("0.2");
  await dialog.getByLabel("Selection end time").fill("1.4");
  await dialog.getByRole("button", { name: /Transcribe .* selection/ }).click();

  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "guest-ledger-phrase",
  );
  await expect(page.getByText(/Selected range transcribed/)).toBeVisible();
  await expect(page.getByText("Straight", { exact: true })).toBeVisible();
  const scoreFooter = page.locator("footer").filter({ hasText: "Tempo:" });
  await expect(scoreFooter).toContainText("Straight");
  await expect(scoreFooter).toContainText("Key: Not analyzed");
  await expect(
    page.locator('section[aria-label="Interactive score"] svg').first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByRole("slider", { name: "Selection start" }),
  ).toHaveAttribute("aria-valuenow", "0.2");
});

test("switches analysis and twelve-key practice views without page overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Analysis" }).click();
  await expect(page.getByText("HARMONIC PATH")).toBeVisible();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(
    page.getByText("Move the phrase through every center."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "C Practice" })).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);
});
