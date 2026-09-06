import { expect, test } from "@playwright/test";
import { createRoomPlayers, reloadAtHeading, requiredPage } from "./room-helpers";

test("Categories: five rounds, private edits, refresh, keyboard, mobile, replay and arcade scores", async ({ browser }, testInfo) => {
  const { contexts, pages } = await createRoomPlayers(browser, ["Original Host", "Original Guest"], { reducedMotion: "reduce" });
  const host = requiredPage(pages, 0);
  const guest = requiredPage(pages, 1);
  await guest.setViewportSize({ width: 390, height: 844 });
  try {
    await expect(host.getByRole("button", { name: /System Crawl/ })).toHaveCount(0);
    await expect(host.getByRole("button", { name: /Categories/ })).toContainText("2–12 players");
    await host.getByRole("button", { name: /Categories/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();
    const categories = new Set<string>();
    for (let round = 1; round <= 5; round++) {
      await expect(host.getByRole("heading", { name: "Think of a unique answer" })).toBeVisible();
      const category = await host.locator(".prompt-card").innerText();
      expect(categories.has(category)).toBe(false);
      categories.add(category);
      await host.getByLabel("Your answer").fill("Private draft");
      await host.getByLabel("Your answer").press("Tab");
      await expect(host.getByRole("button", { name: "Submit answer" })).toBeFocused();
      await host.keyboard.press("Enter");
      await expect(host.getByRole("button", { name: "Update answer" })).toBeVisible();
      await host.getByLabel("Your answer").fill(" COFFEE  mug! ");
      await host.getByRole("button", { name: "Update answer" }).click();
      await expect(host.getByLabel("Your answer")).toHaveValue("COFFEE  mug!");
      await host.getByRole("button", { name: "Update answer" }).click();
      await expect(host.getByLabel("Your answer")).toHaveValue("COFFEE  mug!");
      await expect(guest.getByText("Private draft", { exact: true })).toHaveCount(0);
      await expect(guest.getByText("COFFEE  mug!", { exact: true })).toHaveCount(0);
      if (round === 1) {
        await reloadAtHeading(host, "Think of a unique answer");
        await expect(host.getByLabel("Your answer")).toHaveValue("COFFEE  mug!");
        await reloadAtHeading(guest, "Think of a unique answer");
        await expect(guest.getByLabel("Your answer")).toHaveValue("");
        expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await guest.screenshot({ path: testInfo.outputPath("categories-submit-mobile.png"), fullPage: true });
      }
      await guest.getByLabel("Your answer").fill(round % 2 === 1 ? "coffee mug" : "<b>Distinct answer</b>");
      await guest.getByRole("button", { name: "Submit answer" }).click();
      await expect(host.getByRole("heading", { name: "Unique or cancelled?" })).toBeVisible();
      if (round % 2 === 1) {
        await expect(guest.getByRole("region", { name: "Cancelled answers" })).toContainText("These 2 answers match");
      } else {
        await expect(guest.getByRole("region", { name: "Unique answers" })).toContainText("<b>Distinct answer</b>");
        await expect(guest.locator(".category-results b")).toHaveCount(0);
      }
      if (round === 1 || round === 2) {
        await reloadAtHeading(guest, "Unique or cancelled?");
        expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await guest.screenshot({ path: testInfo.outputPath(`categories-reveal-${round}-mobile.png`), fullPage: true });
        await host.screenshot({ path: testInfo.outputPath(`categories-reveal-${round}-desktop.png`), fullPage: true });
      }
      await host.getByRole("button", { name: "See round scores" }).click();
      await expect(guest.getByRole("heading", { name: "Round complete" })).toBeVisible();
      await expect(host.locator(".game-scoreboard b")).toHaveText(Array(2).fill(round % 2 === 1 ? "0 pts" : "1 pts"));
      await host.getByRole("button", { name: round === 5 ? "See game results" : "Start next round" }).click();
    }
    await reloadAtHeading(guest, "Original thinkers");
    await expect(guest.locator(".game-scoreboard b")).toHaveText(["2 pts", "2 pts"]);
    await expect(guest.locator(".game-scoreboard li > span")).toHaveText(["1", "1"]);
    expect(await guest.locator(".celebration-burst").first().evaluate((el) => Number.parseFloat(getComputedStyle(el).animationDuration))).toBeLessThanOrEqual(0.01);
    await guest.screenshot({ path: testInfo.outputPath("categories-results-mobile.png"), fullPage: true });
    const roomScores = await host.locator(".score").allTextContents();
    await host.getByRole("button", { name: "Play again" }).click();
    await expect(guest.getByRole("heading", { name: "Think of a unique answer" })).toBeVisible();
    await expect(host.locator(".score")).toHaveText(roomScores);
    for (let round = 1; round <= 5; round++) {
      await Promise.all(pages.map(async (page) => {
        await page.getByLabel("Your answer").fill("matching replay answer");
        await page.getByRole("button", { name: "Submit answer" }).click();
      }));
      await host.getByRole("button", { name: "See round scores" }).click();
      await host.getByRole("button", { name: round === 5 ? "See game results" : "Start next round" }).click();
    }
    await host.getByRole("button", { name: "Back to arcade" }).click();
    await expect(guest.getByRole("heading", { name: "Choose a game" })).toBeVisible();
    await expect(host.locator(".player-list li")).toHaveCount(2);
    await expect(host.locator(".score")).toHaveText(roomScores);
    await expect(host.getByRole("button", { name: /System Crawl/ })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
