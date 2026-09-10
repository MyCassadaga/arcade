import { expect, test } from "@playwright/test";
import { createRoomPlayers, reloadAtHeading, requiredPage } from "./room-helpers";

test("Shirt Fight: mobile drawing, private assembly, voting, finals, shared display, reconnect, and awards", async ({ browser }, testInfo) => {
  const { contexts, pages } = await createRoomPlayers(browser, ["Shirt Host", "Shirt Two", "Shirt Three"], { reducedMotion: "reduce" });
  const host = requiredPage(pages, 0);
  const mobile = requiredPage(pages, 1);
  await host.setViewportSize({ width: 1280, height: 900 });
  await mobile.setViewportSize({ width: 390, height: 844 });
  await requiredPage(pages, 2).setViewportSize({ width: 390, height: 844 });
  try {
    await expect(host.getByRole("button", { name: /Shirt Fight/ })).toContainText("3–8 players");
    await host.getByRole("button", { name: /Shirt Fight/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();

    for (let generationRound = 1; generationRound <= 2; generationRound += 1) {
      for (let drawingNumber = 1; drawingNumber <= 2; drawingNumber += 1) {
        await expect(mobile.getByRole("heading", { name: "Draw something unforgettable" })).toBeVisible();
        await expect(mobile.getByRole("group", { name: "Brush color" }).getByRole("button")).toHaveCount(9);
        await expect(mobile.getByRole("group", { name: "Brush size" }).getByRole("button")).toHaveCount(3);
        expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (generationRound === 1 && drawingNumber === 1) {
          const canvas = mobile.getByLabel("Shirt drawing canvas");
          const box = await canvas.boundingBox();
          if (!box) throw new Error("Drawing canvas is not visible");
          await mobile.mouse.move(box.x + box.width * .25, box.y + box.height * .25);
          await mobile.mouse.down();
          await mobile.mouse.move(box.x + box.width * .75, box.y + box.height * .7, { steps: 10 });
          await mobile.mouse.up();
          await mobile.screenshot({ path: testInfo.outputPath("shirt-fight-drawing-mobile.png"), fullPage: true });
          await host.getByRole("button", { name: "Use shared display" }).click();
          await expect(host.getByRole("heading", { name: `Drawing ${drawingNumber} is underway` })).toBeVisible();
          await host.screenshot({ path: testInfo.outputPath("shirt-fight-shared-display.png"), fullPage: true });
          await host.getByRole("button", { name: "Use player view" }).click();
        }
        await Promise.all(pages.map((page) => page.getByRole("button", { name: "Lock drawing" }).click()));
      }

      await expect(mobile.getByRole("heading", { name: "Write as many slogans as you can" })).toBeVisible();
      await reloadAtHeading(mobile, "Write as many slogans as you can");
      await Promise.all(pages.map(async (page, index) => {
        const input = page.getByLabel("Your next slogan");
        await input.fill(`Round ${generationRound} slogan ${index + 1}`);
        await input.press("Enter");
        await expect(input).toHaveValue("");
        await input.fill(`Another line ${generationRound}-${index + 1}`);
        await page.getByRole("button", { name: "Add" }).click();
        await page.getByRole("button", { name: "Done writing" }).click();
      }));

      await expect(mobile.getByRole("heading", { name: "Build your contender" })).toBeVisible();
      await expect(mobile.getByRole("button", { name: "Previous drawing" })).toBeVisible();
      await expect(mobile.getByRole("button", { name: "Next slogan" })).toBeVisible();
      await mobile.getByRole("button", { name: "Next drawing" }).click();
      await mobile.getByRole("button", { name: "Previous drawing" }).click();
      await mobile.getByRole("button", { name: "Next slogan" }).click();
      if (generationRound === 1) await mobile.screenshot({ path: testInfo.outputPath("shirt-fight-builder-mobile.png"), fullPage: true });
      await Promise.all(pages.map((page) => page.getByRole("button", { name: "Lock this shirt" }).click()));

      for (let matchup = 0; matchup < 2; matchup += 1) {
        await expect(mobile.getByRole("heading", { name: "Choose the stronger shirt" })).toBeVisible();
        await expect(mobile.getByText("Vote for this shirt")).toHaveCount(2);
        await host.getByText("Vote for this shirt").first().click();
        await expect(host.getByText("Vote locked. Waiting for the runway…")).toBeVisible();
        await mobile.getByText("Vote for this shirt").first().click();
        await expect(mobile.getByText("Vote locked. Waiting for the runway…")).toBeVisible();
        await requiredPage(pages, 2).getByText("Vote for this shirt").first().click();
        if (matchup === 0) await expect(host.getByText("Vote for this shirt")).toHaveCount(2);
      }
      await expect(host.getByRole("heading", { name: `Round ${generationRound} champion` })).toBeVisible();
      await expect(host.getByText("Artist", { exact: true })).toBeVisible();
      await expect(host.getByText("Words", { exact: true })).toBeVisible();
      await expect(host.getByText("Shirt creator", { exact: true })).toBeVisible();
      if (generationRound === 1) await host.getByRole("button", { name: "Start round two" }).click();
      else await host.getByRole("button", { name: "Start finals" }).click();
    }

    for (let finalMatchup = 0; finalMatchup < 7; finalMatchup += 1) {
      if (await host.getByRole("heading", { name: "The ultimate shirt" }).count()) break;
      await expect(host.getByRole("heading", { name: "Final tournament" })).toBeVisible();
      await expect(mobile.getByRole("heading", { name: "Final tournament" })).toBeVisible();
      await host.getByText("Vote for this shirt").first().click();
      await expect(host.getByText("Vote locked. Waiting for the runway…")).toBeVisible();
      await mobile.getByText("Vote for this shirt").first().click();
      await expect(mobile.getByText("Vote locked. Waiting for the runway…")).toBeVisible();
      await requiredPage(pages, 2).getByText("Vote for this shirt").first().click();
      await expect.poll(async () => {
        if (await host.getByRole("heading", { name: "The ultimate shirt" }).count()) return "done";
        return await host.getByText("Vote for this shirt").count() === 2 ? "next" : "waiting";
      }).not.toBe("waiting");
    }
    await expect(host.getByRole("heading", { name: "The ultimate shirt" })).toBeVisible();
    await host.getByRole("button", { name: "Show awards" }).click();
    await expect(mobile.getByLabel("Post-game awards")).toBeVisible();
    await expect(mobile.getByText("Fashion Designer")).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mobile.screenshot({ path: testInfo.outputPath("shirt-fight-results-mobile.png"), fullPage: true });
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
