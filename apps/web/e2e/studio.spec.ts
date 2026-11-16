import { expect, test } from "@playwright/test";

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
    page.locator('section[aria-label="Interactive score"] svg').first(),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "New Transcription" }).click();
  const dialog = page.getByRole("dialog", { name: "Bring in a recording" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Audio file" })).toBeVisible();
  await dialog.getByRole("tab", { name: "YouTube / Spotify" }).click();
  await expect(dialog).toContainText("never rips protected audio");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("switches analysis and twelve-key practice views without page overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("tab", { name: "Analysis" }).click();
  await expect(page.getByText("HARMONIC PATH")).toBeVisible();
  await page.getByRole("tab", { name: "Practice", exact: true }).click();
  await expect(page.getByText("Move the phrase through every center.")).toBeVisible();
  await expect(page.getByRole("button", { name: "C Practice" })).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflows).toBe(false);
});
