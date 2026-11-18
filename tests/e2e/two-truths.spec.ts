import { expect, test } from "@playwright/test";
import { createRoomPlayers, reloadAtHeading, requiredPage } from "./room-helpers";

for (const responseCount of [5, 7]) {
test(`sealed Two Truths: ${responseCount} respondents, seven players, mobile and reconnect`, async ({ browser }, info) => {
  const names = Array.from({ length: 7 }, (_, i) => `Fixture Player ${i}`);
  const deck = { version: 1, participants: names.slice(0, responseCount).map((displayName, i) => ({ displayName, truths: [`Fixture ${i} true A`, `Fixture ${i} true B`], lie: `Fixture ${i} false C`, lieSource: "authored" })) };
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
    for (let round = 1; round <= responseCount; round++) {
      await expect(host.locator(".phase-kicker")).toContainText(`Round ${round} of ${responseCount}`);
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
      await host.getByRole("button", { name: round === responseCount ? "See final standings" : "Next person" }).click();
    }
    expect(subjects.size).toBe(responseCount);
    await reloadAtHeading(mobile, "Who spotted the lies?");
    await expect(mobile.locator(".game-scoreboard b")).toHaveText(Array.from({ length: 7 }, () => `${responseCount - 1} pts`).sort((a, b) => Number.parseInt(b) - Number.parseInt(a)));
    await mobile.screenshot({ path: info.outputPath("results-mobile.png"), fullPage: true });
    await host.screenshot({ path: info.outputPath("results-desktop.png"), fullPage: true });
    await host.getByRole("button", { name: "Play again", exact: true }).click();
    await expect(host.getByRole("heading", { name: "Keep it sealed" })).toBeVisible();
    await expect(host.getByRole("heading", { name: "Game file sealed" })).toHaveCount(0);
    await host.getByRole("button", { name: "Back to arcade" }).click();
    await expect(host.getByRole("heading", { name: "Choose a game" })).toBeVisible();
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

}

test("host seals the file before the other six players join", async ({ browser }) => {
  const names = Array.from({ length: 7 }, (_, i) => `Later Player ${i}`);
  const { contexts, pages } = await createRoomPlayers(browser, [names[0]!]);
  const host = requiredPage(pages, 0);
  try {
    await host.getByRole("button", { name: /Two Truths and a Lie/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();
    const deck = { version: 1, participants: names.slice(0, 5).map((displayName, i) => ({ displayName, truths: [`Later fixture ${i} A`, `Later fixture ${i} B`], lie: `Later fixture ${i} C`, lieSource: "generated" })) };
    await host.getByLabel("Prepared game file (.json)").setInputFiles({ name: "sealed.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(deck)) });
    await expect(host.getByRole("heading", { name: "Game file sealed" })).toBeVisible();
    await expect(host.getByRole("button", { name: "Begin blind game" })).toBeEnabled();
    const code = await host.locator(".room-banner h1").innerText();
    for (const name of names.slice(1)) {
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage(); pages.push(page);
      await page.goto(`/?room=${code}`); await page.getByLabel("Display name").fill(name);
      await page.getByRole("button", { name: "Join the fun" }).click();
      await expect(page.getByRole("heading", { name: "Keep it sealed" })).toBeVisible();
      await expect(page.locator(".two-truths")).not.toContainText("Later fixture");
    }
    await expect(host.getByRole("button", { name: "Begin blind game" })).toBeEnabled();
    await host.getByRole("button", { name: "Begin blind game" }).click();
    await expect(host.locator(".phase-kicker")).toContainText("Round 1 of 5");
    await host.getByRole("button", { name: "Close voting and reveal (6 missing)" }).click();
    await expect(host.getByText("The lie is revealed.")).toBeVisible();
    await expect(host.getByText("No points this time")).toBeVisible();
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

for (const count of [1, 3]) {
  test(`attendance ${count}: skips absent responses and reveals solo explicitly`, async ({ browser }) => {
    const names = Array.from({ length: count }, (_, i) => `Attendee ${i}`);
    const { contexts, pages } = await createRoomPlayers(browser, names);
    const host = requiredPage(pages, 0);
    try {
      await host.getByRole("button", { name: /Two Truths and a Lie/ }).click();
      await host.getByRole("button", { name: "Start game" }).click();
      const deck = { version: 1, participants: [names[0]!, "Absent respondent"].map(displayName => ({ displayName, truths: ["Attendance fixture A", "Attendance fixture B"], lie: "Attendance fiction C", lieSource: "authored" })) };
      await host.getByLabel("Prepared game file (.json)").setInputFiles({ name: "attendance.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(deck)) });
      await expect(host.getByText(`2 responses loaded · ${count} ${count === 1 ? "player" : "players"} connected · 1 round available`)).toBeVisible();
      await expect(host.getByText("Skipped if absent: Absent respondent")).toBeVisible();
      await host.getByRole("button", { name: "Begin blind game" }).click();
      await expect(host.locator(".phase-kicker")).toContainText("Round 1 of 1");
      if (count === 1) {
        await expect(host.getByText("No guesses are needed. The host can reveal this round.")).toBeVisible();
        await host.getByRole("button", { name: "Reveal lie" }).click();
      } else {
        for (const page of pages.slice(1)) {
          await page.locator(".tt-option").filter({ hasText: "Attendance fiction C" }).getByRole("radio").check();
          await page.getByRole("button", { name: "Lock guess", exact: true }).click();
        }
      }
      await expect(host.getByText("The lie is revealed.")).toBeVisible();
      await host.getByRole("button", { name: "See final standings" }).click();
      await expect(host.locator(".game-scoreboard b")).toHaveText(Array(count).fill("0 pts"));
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}
