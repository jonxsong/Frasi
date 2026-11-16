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
  await expect(
    page.getByRole("tab", { name: "All 12 Keys" }),
  ).toHaveCount(0);
  await expect(page.getByText("Concert Pitch", { exact: true })).toHaveCount(0);
  await expect(
    page.getByLabel("Instrument (for playback)"),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Show Chord Analysis" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Loop Selection (A–B)" }),
  ).toBeVisible();
  const score = page.locator('section[aria-label="Interactive score"]');
  await expect(score.locator("svg").first()).toBeVisible({ timeout: 20_000 });
  await expect(score).toContainText("C△7");
  await expect(score).toContainText("D−7");
  await expect(score.locator(".harm")).toHaveCount(12);
  await expect(score.locator(".ledgerLines path")).not.toHaveCount(0);
  await expect
    .poll(() =>
      score.locator(".ledgerLines path").first().evaluate((path) => {
        const style = getComputedStyle(path);
        return `${style.strokeWidth} ${style.vectorEffect}`;
      }),
    )
    .toBe("1.5px non-scaling-stroke");

  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog", { name: "Bring in a recording" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Audio file" })).toBeVisible();
  await dialog.getByRole("tab", { name: "YouTube / Spotify" }).click();
  await expect(dialog).toContainText("Capture 20 seconds from playing tab");
  await expect(dialog).toContainText(
    "Browser-mediated, real-time capture only",
  );
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("requests browser-mediated audio for a streaming reference", async ({
  page,
}, testInfo) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  test.skip(
    testInfo.project.name !== "chromium",
    "Tab capture only needs one desktop regression pass.",
  );
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getDisplayMedia: async () => new MediaStream() },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog", { name: "Bring in a recording" });
  await dialog.getByRole("tab", { name: "YouTube / Spotify" }).click();
  await dialog
    .getByLabel("YouTube or Spotify URL")
    .fill("https://open.spotify.com/track/frasi-smoke");
  await dialog
    .getByRole("button", { name: "Capture 20 seconds from playing tab" })
    .click();
  await expect(dialog).toContainText("No tab audio was shared");
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
  test.skip(
    testInfo.project.name !== "chromium",
    "The browser DSP path only needs one desktop regression pass.",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog", { name: "Bring in a recording" });
  await expect(dialog).toContainText("No account is required");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "guest-ledger-phrase.wav",
    mimeType: "audio/wav",
    buffer: wavFixture(),
  });

  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "guest-ledger-phrase",
  );
  await expect(page.getByText(/Local transcription ready/)).toBeVisible();
  await expect(
    page.locator('section[aria-label="Interactive score"] svg').first(),
  ).toBeVisible({ timeout: 20_000 });
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
