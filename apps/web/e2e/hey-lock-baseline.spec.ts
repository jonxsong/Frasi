import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import baseline from "./fixtures/hey-lock.baseline.json";

const DEFAULT_WINDOWS_FIXTURE =
  "C:\\Users\\jz\\OneDrive\\Desktop\\Hey Lock.mp3";
const fixturePath =
  process.env.FRASI_BASELINE_AUDIO ??
  (process.platform === "win32" ? DEFAULT_WINDOWS_FIXTURE : "");

function count(xml: string, pattern: RegExp): number {
  return xml.match(pattern)?.length ?? 0;
}

test("matches the canonical Hey Lock 1:23–1:43 transcription baseline", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    testInfo.project.name !== "chromium",
    "The canonical ML baseline runs once on desktop Chromium.",
  );
  test.skip(
    !fixturePath || !existsSync(fixturePath),
    "Set FRASI_BASELINE_AUDIO to the canonical Hey Lock.mp3 fixture.",
  );

  const fixture = readFileSync(fixturePath);
  expect(createHash("sha256").update(fixture).digest("hex")).toBe(
    baseline.source.sha256,
  );

  const pageErrors: string[] = [];
  const failedResponses: Array<{ status: number; url: string }> = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(fixturePath);
  await expect(
    dialog.getByRole("heading", { name: "Select the phrase" }),
  ).toBeVisible({ timeout: 30_000 });
  await dialog
    .getByLabel("Selection start time")
    .fill(String(baseline.selection.startSeconds));
  await dialog
    .getByLabel("Selection end time")
    .fill(String(baseline.selection.endSeconds));
  await expect(dialog.getByText("0:20.0 selected")).toBeVisible();

  await dialog.getByRole("button", { name: /Transcribe .* selection/ }).click();
  await expect(dialog).toBeHidden({ timeout: 150_000 });
  await expect(page.getByText(/Selected range transcribed/)).toContainText(
    `${baseline.expected.detectedLeadNotes} lead notes at about ${baseline.expected.bpm} BPM`,
  );
  await expect(
    page.getByRole("slider", { name: "Selection start" }),
  ).toHaveAttribute("aria-valuenow", String(baseline.selection.startSeconds));

  await page.getByRole("button", { name: "Export" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "MusicXML" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const xml = readFileSync(downloadPath!, "utf8");
  const noteBodies = [...xml.matchAll(/<note>[\s\S]*?<\/note>/g)]
    .map((match) => match[0])
    .join("");

  expect({
    bpm: Number(xml.match(/<per-minute>(\d+)<\/per-minute>/)?.[1]),
    measureCount: count(xml, /<measure\b/g),
    musicXmlNoteElements: count(xml, /<note>/g),
    pitchedNoteElements: count(xml, /<pitch>/g),
    tripletGroups: count(xml, /<tuplet type="start"/g),
    beamElements: count(xml, /<beam number=/g),
    tieElements: count(xml, /<tie type=/g),
    symbolicSha256: createHash("sha256").update(noteBodies).digest("hex"),
  }).toEqual({
    bpm: baseline.expected.bpm,
    measureCount: baseline.expected.measureCount,
    musicXmlNoteElements: baseline.expected.musicXmlNoteElements,
    pitchedNoteElements: baseline.expected.pitchedNoteElements,
    tripletGroups: baseline.expected.tripletGroups,
    beamElements: baseline.expected.beamElements,
    tieElements: baseline.expected.tieElements,
    symbolicSha256: baseline.expected.symbolicSha256,
  });
  expect(pageErrors).toEqual([]);
  expect(failedResponses).toEqual([]);

  await testInfo.attach("hey-lock-83-103.musicxml", {
    body: Buffer.from(xml),
    contentType: "application/vnd.recordare.musicxml+xml",
  });
  await testInfo.attach("hey-lock-83-103.png", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
