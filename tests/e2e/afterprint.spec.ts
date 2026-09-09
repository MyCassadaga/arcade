import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  AFTERPRINT_PUZZLE_BANK_V1,
  getAfterprintPuzzleNumber,
  selectAfterprintPuzzle,
  validateAfterprintPuzzle
} from "@team-arcade/games/afterprint/puzzles";
import type { AfterprintEventId } from "@team-arcade/shared";

test("AFTERPRINT: mobile reconstruction, replay, history, patterns, sharing and desktop controls", async ({ browser }, testInfo) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /System Crawl/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Single-player" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("afterprint-mobile-entry.png"), fullPage: true });
    await page.getByRole("button", { name: "Play AFTERPRINT solo" }).click();

    await expect(page.getByRole("heading", { name: "AFTERPRINT" })).toBeVisible();
    await expect(page).toHaveURL(/\?play=afterprint$/u);
    await expect(page.getByText("Room code")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy invite link" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Choose a game" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Players" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "AFTERPRINT" })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Target board:/ })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Replay board:/ })).toBeVisible();
    await expect(page.locator(".afterprint-events > li")).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("afterprint-mobile-start.png"), fullPage: true });

    await page.getByRole("button", { name: "Replay order" }).click();
    await expect(page.locator(".afterprint-feedback")).toContainText(/Event [1-5]\/5/u);
    await page.screenshot({ path: testInfo.outputPath("afterprint-mobile-replay.png"), fullPage: true });
    await expect(page.locator(".afterprint-feedback")).toContainText(/squares still differ/u);
    await expect(page.locator(".afterprint-board > .is-mismatch")).not.toHaveCount(0);
    await expect(page.getByRole("button", { name: /Replay attempt 1:/ })).toBeVisible();

    await page.getByRole("button", { name: /Replay attempt 1:/ }).click();
    await expect(page.locator(".afterprint-feedback")).toContainText("No attempt used");
    await expect(page.locator(".afterprint-meta strong")).toHaveText("1/4");
    await page.getByRole("button", { name: "Enlarge target board" }).click();
    await expect(page.getByRole("dialog", { name: "Enlarged target board" })).toBeVisible();
    await page.getByRole("button", { name: "Close enlarged board" }).click();

    const puzzleNumber = getAfterprintPuzzleNumber(Date.now());
    const selectedPuzzle = selectAfterprintPuzzle(puzzleNumber);
    const definition = AFTERPRINT_PUZZLE_BANK_V1.find((puzzle) => puzzle.id === selectedPuzzle.id);
    if (!definition) throw new Error("Missing frozen test puzzle");
    const solution = validateAfterprintPuzzle(definition).solutionOrders[0];
    if (!solution) throw new Error("Missing validated solution");
    await reorder(page, [...selectedPuzzle.initialEventIds], solution);
    await page.getByRole("button", { name: "Replay order" }).click();
    await expect(page.getByRole("heading", { name: "Solved in 2/4" })).toBeVisible();
    await expect(page.locator(".afterprint-feedback")).toContainText("Trace matched. Case closed.");
    await expect(page.locator(".afterprint-board > .is-mismatch")).toHaveCount(0);
    const targetSummary = await page.getByRole("region", { name: /^Target board:/ }).getAttribute("aria-label");
    const replaySummary = await page.getByRole("region", { name: /^Replay board:/ }).getAttribute("aria-label");
    expect(replaySummary?.replace("Replay", "Target")).toBe(targetSummary);

    await page.getByRole("button", { name: "Share result" }).click();
    const share = page.getByLabel("Spoiler-free result");
    await expect(share).toContainText(/AFTERPRINT #[0-9]+\n▶ Solved in 2\/4\n\n[0-9]+ → 0 ✦/u);
    expect(await share.inputValue()).not.toContain(solution.join(""));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("afterprint-mobile-result.png"), fullPage: true });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: /Replay attempt 1:/ }).click();
    await expect(page.locator(".afterprint-feedback")).toContainText("No attempt used");
    await page.screenshot({ path: testInfo.outputPath("afterprint-desktop-history.png"), fullPage: true });
    await page.getByRole("button", { name: "Back to arcade" }).click();
    await expect(page.getByRole("heading", { name: /team\s*arcade/i })).toBeVisible();
    await expect(page).toHaveURL(/\/$/u);
    await page.screenshot({ path: testInfo.outputPath("afterprint-desktop-entry.png"), fullPage: true });
    await page.reload();
    await expect(page.getByRole("button", { name: "Play AFTERPRINT solo" })).toBeVisible();
  } finally {
    await context.close();
  }
});

async function reorder(page: Page, starting: AfterprintEventId[], target: AfterprintEventId[]) {
  const current = [...starting];
  for (let index = 0; index < current.length; index += 1) {
    if (current[index] === target[index]) continue;
    const swapIndex = current.indexOf(target[index] as AfterprintEventId);
    await page.getByRole("button", { name: new RegExp(`^${index + 1}\\.`) }).click();
    await page.getByRole("button", { name: new RegExp(`^${swapIndex + 1}\\.`) }).click();
    [current[index], current[swapIndex]] = [current[swapIndex] as AfterprintEventId, current[index] as AfterprintEventId];
  }
}
