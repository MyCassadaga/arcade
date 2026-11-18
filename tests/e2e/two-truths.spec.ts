import { expect, test } from "@playwright/test";
import { createRoomPlayers, reloadAtHeading, requiredPage } from "./room-helpers";

test("sealed Two Truths: opaque import, seven rounds, mobile, reconnect and results", async ({ browser }, info) => {
  const names = Array.from({ length: 7 }, (_, i) => `Fixture Player ${i}`);
  const deck = { version: 1, participants: names.map((displayName, i) => ({ displayName, truths: [`Fixture ${i} true A`, `Fixture ${i} true B`], lie: `Fixture ${i} false C`, lieSource: "authored" })) };
  const { contexts, pages } = await createRoomPlayers(browser, names, { reducedMotion: "reduce" });
  const host = requiredPage(pages, 0), mobile = requiredPage(pages, 1);
  await host.setViewportSize({ width: 1440, height: 900 }); await mobile.setViewportSize({ width: 390, height: 844 });
  try {
    await host.getByRole("button", { name: /Two Truths and a Lie/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();
    await expect(host.getByRole("heading", { name: "Keep it sealed" })).toBeVisible();
    await host.screenshot({ path: info.outputPath("setup-desktop.png"), fullPage: true });
    await mobile.screenshot({ path: info.outputPath("setup-mobile.png"), fullPage: true });
    await host.getByLabel("Prepared game file (.json)").setInputFiles({ name: "sealed-game.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(deck)) });
    await expect(host.getByRole("heading", { name: "Game file sealed" })).toBeVisible();
    for (const page of pages) await expect(page.locator(".two-truths")).not.toContainText("true A");
    await host.getByRole("button", { name: "Begin blind game" }).click();
    const subjects = new Set<string>();
    for (let round = 1; round <= 7; round++) {
      await expect(host.locator(".phase-kicker")).toContainText(`Round ${round} of 7`);
      const subject = await host.locator(".phase-card h2").innerText(); subjects.add(subject);
      const eligible = pages.filter((_page, i) => names[i] !== subject);
      await expect(pages[names.indexOf(subject)]!.getByText(/Sit out this round/)).toBeVisible();
      const first = eligible[0]!;
      const lie = first.locator(".tt-option").filter({ hasText: "false C" });
      await lie.getByRole("radio").check();
      await expect(lie).toContainText("Selected");
      if (round === 1) {
        await host.screenshot({ path: info.outputPath("guessing-desktop.png"), fullPage: true });
        await mobile.screenshot({ path: info.outputPath("guessing-mobile.png"), fullPage: true });
        expect(await mobile.locator(".two-truths").evaluate(el => el.getBoundingClientRect().top)).toBeLessThan(await mobile.locator(".players-panel").evaluate(el => el.getBoundingClientRect().top));
      }
      await first.getByRole("button", { name: "Lock guess", exact: true }).click();
      await expect(first.getByText("Guess locked. Waiting for the reveal.")).toBeVisible();
      if (round === 1) {
        await first.reload(); await expect(first.getByText("Guess locked. Waiting for the reveal.")).toBeVisible();
        await expect(first.locator(".tt-selected")).toHaveCount(1);
      }
      for (const page of eligible.slice(1)) {
        await page.locator(".tt-option").filter({ hasText: "false C" }).getByRole("radio").check();
        await page.getByRole("button", { name: "Lock guess", exact: true }).click();
      }
      await expect(host.getByText("The lie is revealed.")).toBeVisible();
      await expect(host.locator(".tt-lie")).toContainText("false C");
      if (round === 1) {
        await host.screenshot({ path: info.outputPath("reveal-desktop.png"), fullPage: true });
        await mobile.screenshot({ path: info.outputPath("reveal-mobile.png"), fullPage: true });
        await mobile.setViewportSize({ width: 320, height: 844 });
        expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await mobile.setViewportSize({ width: 390, height: 844 });
      }
      await host.getByRole("button", { name: round === 7 ? "See final standings" : "Next person" }).click();
    }
    expect(subjects.size).toBe(7);
    await reloadAtHeading(mobile, "Who spotted the lies?");
    await expect(mobile.locator(".game-scoreboard b")).toHaveText(Array(7).fill("6 pts"));
    await mobile.screenshot({ path: info.outputPath("results-mobile.png"), fullPage: true });
    await host.screenshot({ path: info.outputPath("results-desktop.png"), fullPage: true });
    await host.getByRole("button", { name: "Play again", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Keep it sealed" })).toBeVisible();
    await expect(host.getByRole("heading", { name: "Game file sealed" })).toHaveCount(0);
    await host.getByRole("button", { name: "Back to arcade" }).click();
    await expect(host.getByRole("heading", { name: "Choose a game" })).toBeVisible();
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
