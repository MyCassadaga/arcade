import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const playerNames = Array.from({ length: 7 }, (_, index) => `Player ${String.fromCharCode(65 + index)}`);

test("entry and lobby primary actions remain usable on a phone-sized viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /team\s*arcade/i })).toBeVisible();
  await page.getByLabel("Display name").fill("Mobile Host");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.getByRole("button", { name: "Copy invite link" })).toBeVisible();
  await expect(page.getByLabel("Share this link")).toHaveValue(/\?room=[A-HJ-NP-Z2-9]{5}$/u);
  await expect(page.getByRole("button", { name: /Who Said That/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("two players synchronize a System Crawl move and ability across desktop and phone layouts", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await host.goto("/");
    await host.getByLabel("Display name").fill("Crawl Host");
    await host.getByRole("button", { name: "Create game" }).click();
    const roomCode = await host.locator(".room-banner h1").innerText();

    await guest.goto(`/?room=${roomCode}`);
    await guest.getByLabel("Display name").fill("Crawl Guest");
    await guest.getByRole("button", { name: "Join the fun" }).click();
    await Promise.all([host, guest].map((page) => expect(page.locator(".player-list li")).toHaveCount(2)));

    await host.getByRole("button", { name: /System Crawl/ }).click();
    await expect(guest.getByRole("button", { name: /System Crawl/ })).toHaveAttribute("aria-pressed", "true");
    await host.getByRole("button", { name: "Start game" }).click();
    await Promise.all([host, guest].map((page) => expect(page.getByRole("heading", { name: "Assemble the response team" })).toBeVisible()));

    await host.getByRole("button", { name: /Application Developer/ }).click();
    await guest.getByRole("button", { name: /Infrastructure Architect/ }).click();
    await expect(host.getByRole("button", { name: "Initialize adventure" })).toBeVisible();
    await host.getByRole("button", { name: "Initialize adventure" }).click();
    await Promise.all([host, guest].map((page) => expect(page.getByRole("heading", { name: "System topology" })).toBeVisible()));

    await expect(host.locator(".sc-incident-bar dd").nth(1)).toHaveText("Application Developer");
    const destination = host.getByRole("gridcell", { name: /valid movement destination/i }).first();
    await destination.click();
    await Promise.all([host, guest].map((page) => expect(page.getByText("character moved", { exact: true })).toBeVisible()));

    await host.getByRole("button", { name: /Works on My Machine/ }).click();
    await host.getByRole("gridcell", { name: /valid works on my machine target/i }).click();
    await Promise.all([host, guest].map((page) => expect(page.getByText("ability used", { exact: true })).toBeVisible()));
    await expect(host.getByRole("button", { name: "End Turn" })).toBeEnabled();
    await expect(guest.getByRole("button", { name: /End Turn/ })).toBeDisabled();
    await host.getByRole("button", { name: "End Turn" }).click();

    await guest.setViewportSize({ width: 390, height: 844 });
    await expect(guest.locator(".sc-incident-bar dd").nth(1)).toHaveText("Infrastructure Architect");
    await expect(guest.locator(".sc-board-console")).toBeVisible();
    await expect(guest.locator(".sc-hud")).toBeVisible();
    await expect(guest.getByRole("button", { name: "End Turn and Reboot Abilities" })).toBeEnabled();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await guest.getByRole("button", { name: "End Turn and Reboot Abilities" }).click();
    await Promise.all([host, guest].map((page) => expect(page.locator(".sc-incident-bar dd").first()).toHaveText("2")));

    await guest.reload();
    await expect(guest.getByRole("heading", { name: "System topology" })).toBeVisible();
    await expect(guest.locator(".sc-incident-bar dd").first()).toHaveText("2");
    await expect(guest.getByText("Application Developer", { exact: true }).first()).toBeVisible();
    await expect(guest.locator(".sc-incident-bar dd").nth(1)).toHaveText(await host.locator(".sc-incident-bar dd").nth(1).innerText());
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test("seven players complete Who Said That and an Impostor round without losing private state", async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (let index = 0; index < playerNames.length; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      pages.push(await context.newPage());
    }

    const host = requiredPage(pages, 0);
    await host.goto("/");
    await host.getByLabel("Display name").fill(playerNames[0] as string);
    await host.getByRole("button", { name: "Create game" }).click();
    await expect(host.getByText("Players", { exact: true })).toBeVisible();
    const roomCode = await host.locator(".room-banner h1").innerText();

    for (let index = 1; index < pages.length; index += 1) {
      const page = requiredPage(pages, index);
      await page.goto(`/?room=${roomCode}`);
      await page.getByLabel("Display name").fill(playerNames[index] as string);
      await page.getByRole("button", { name: "Join the fun" }).click();
    }
    await Promise.all(pages.map((page) => expect(page.locator(".player-list li")).toHaveCount(7)));
    const reconnectingPlayer = requiredPage(pages, 2);
    await reconnectingPlayer.reload();
    await expect(reconnectingPlayer.getByText("Player C (you)")).toBeVisible();
    await expect(reconnectingPlayer.locator(".player-list li")).toHaveCount(7);

    await host.getByRole("button", { name: /Who Said That/ }).click();
    await expect(requiredPage(pages, 1).getByRole("button", { name: /Who Said That/ })).toHaveAttribute("aria-pressed", "true");
    await expect(requiredPage(pages, 1).getByRole("button", { name: /Impostor/ })).toBeDisabled();
    await host.getByRole("button", { name: "Start game" }).click();
    await reloadAtHeading(reconnectingPlayer, "Answer in your own words");

    for (let round = 1; round <= 3; round += 1) {
      await Promise.all(pages.map(async (page, index) => {
        await page.getByLabel("Your answer").fill(`Round ${round} answer from ${playerNames[index]}`);
        await page.getByRole("button", { name: "Submit answer" }).click();
      }));

      if (round === 1) await reloadAtHeading(reconnectingPlayer, "Who said this?");

      for (let answerIndex = 0; answerIndex < pages.length; answerIndex += 1) {
        await expect(host.getByRole("heading", { name: "Who said this?" })).toBeVisible();
        const authorIndex = await findVisiblePage(pages, "You wrote this one — watch everyone guess.");
        const authorName = playerNames[authorIndex] as string;
        await Promise.all(pages.map(async (page, index) => {
          if (index !== authorIndex) await page.getByRole("button", { name: authorName, exact: true }).click();
        }));
        await expect(host.getByText("Answer revealed", { exact: true })).toBeVisible();

        if (round === 1 && answerIndex === 0) {
          await reconnectingPlayer.reload();
          await expect(reconnectingPlayer.getByText("Player C (you)")).toBeVisible();
          await expect(reconnectingPlayer.getByText("Answer revealed", { exact: true })).toBeVisible();
        }

        await host.getByRole("button", { name: "Next answer" }).click();
      }

      await expect(host.getByRole("heading", { name: "Round complete" })).toBeVisible();
      if (round === 1) await reloadAtHeading(reconnectingPlayer, "Round complete");
      await host.getByRole("button", { name: round === 3 ? "See game results" : "Start next round" }).click();
    }

    await expect(host.getByRole("heading", { name: "Who knew the team best?" })).toBeVisible();
    await reloadAtHeading(reconnectingPlayer, "Who knew the team best?");
    const finalGameScores = await host.locator(".game-scoreboard li").allTextContents();
    await Promise.all(pages.map((page) => expect(page.locator(".game-scoreboard li")).toHaveText(finalGameScores)));
    const scoresBeforeArcade = await host.locator(".score").allInnerTexts();
    await host.getByRole("button", { name: "Back to arcade" }).click();
    await expect(host.getByRole("heading", { name: "Choose a game" })).toBeVisible();
    await expect(host.locator(".player-list li")).toHaveCount(7);
    await expect(host.locator(".score")).toHaveText(scoresBeforeArcade);

    await host.getByRole("button", { name: /Impostor/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();
    await Promise.all(pages.map((page) => expect(page.getByText("Keep this screen private", { exact: true })).toBeVisible()));

    const impostorIndex = await findVisibleHeading(pages, "You are the Impostor");
    const nonImpostorPages = pages.filter((_, index) => index !== impostorIndex);
    const visibleWords = await Promise.all(nonImpostorPages.map((page) => page.locator(".secret-card strong").innerText()));
    expect(new Set(visibleWords).size).toBe(1);
    const secretWord = visibleWords[0] as string;
    await expect(requiredPage(pages, impostorIndex).getByText(secretWord, { exact: true })).toHaveCount(0);
    const impostorPage = requiredPage(pages, impostorIndex);
    await reloadAtHeading(impostorPage, "You are the Impostor");
    await expect(impostorPage.getByText(secretWord, { exact: true })).toHaveCount(0);

    await host.getByRole("button", { name: "Everyone ready — start clues" }).click();
    await reloadAtHeading(reconnectingPlayer, "Give one subtle clue");
    await Promise.all(pages.map(async (page, index) => {
      await page.getByLabel("Your clue").fill(`hint-${index}`);
      await page.getByRole("button", { name: "Lock clue" }).click();
    }));
    await reconnectingPlayer.reload();
    await expect(reconnectingPlayer.getByText("Clue 1 of 7", { exact: true })).toBeVisible();

    for (let revealed = 1; revealed <= pages.length; revealed += 1) {
      const action = revealed === pages.length ? "Start discussion" : "Next clue";
      await host.getByRole("button", { name: action }).click();
    }
    await expect(host.getByRole("heading", { name: "Who sounds suspicious?" })).toBeVisible();
    await reloadAtHeading(reconnectingPlayer, "Who sounds suspicious?");
    await host.getByRole("button", { name: "Start vote" }).click();
    await reloadAtHeading(reconnectingPlayer, "Find the Impostor");

    const impostorName = playerNames[impostorIndex] as string;
    await Promise.all(pages.map(async (page, index) => {
      const target = index === impostorIndex ? playerNames[(impostorIndex + 1) % playerNames.length] as string : impostorName;
      await page.getByRole("button", { name: target, exact: true }).click();
    }));
    await expect(host.getByRole("heading", { name: "Impostor caught!" })).toBeVisible();
    await reloadAtHeading(reconnectingPlayer, "Impostor caught!");
    await host.getByRole("button", { name: "Give the Impostor one guess" }).click();

    await reloadAtHeading(impostorPage, "One last chance");
    await impostorPage.getByLabel("Secret word guess").fill(secretWord);
    await impostorPage.getByRole("button", { name: "Make final guess" }).click();
    await expect(host.getByRole("heading", { name: "The Impostor stole it" })).toBeVisible();
    await expect(host.getByText(secretWord, { exact: true })).toBeVisible();
    await reloadAtHeading(reconnectingPlayer, "The Impostor stole it");
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function findVisiblePage(pages: Page[], text: string): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (let index = 0; index < pages.length; index += 1) {
      if (await requiredPage(pages, index).getByText(text, { exact: true }).isVisible()) return index;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`No page displayed: ${text}`);
}

async function findVisibleHeading(pages: Page[], name: string): Promise<number> {
  for (let index = 0; index < pages.length; index += 1) {
    if (await requiredPage(pages, index).getByRole("heading", { name }).isVisible()) return index;
  }
  throw new Error(`No page displayed heading: ${name}`);
}

function requiredPage(pages: Page[], index: number): Page {
  const page = pages[index];
  if (!page) throw new Error(`Missing page ${index}`);
  return page;
}

async function reloadAtHeading(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}
