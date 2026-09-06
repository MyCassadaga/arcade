import { expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

export async function createRoomPlayers(browser: Browser, names: string[], options: BrowserContextOptions = {}) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (const name of names) {
      const context = await browser.newContext(options);
      contexts.push(context);
      const page = await context.newPage();
      pages.push(page);
      const roomCode = pages.length === 1 ? null : await requiredPage(pages, 0).locator(".room-banner h1").innerText();
      await page.goto(roomCode ? `/?room=${roomCode}` : "/");
      await page.getByLabel("Display name").fill(name);
      await page.getByRole("button", { name: roomCode ? "Join the fun" : "Create game" }).click();
      await expect(page.getByText("Players", { exact: true })).toBeVisible();
    }
    await Promise.all(pages.map((page) => expect(page.locator(".player-list li")).toHaveCount(names.length)));
    return { contexts, pages };
  } catch (error) {
    await Promise.all(contexts.map((context) => context.close()));
    throw error;
  }
}

export function requiredPage(pages: Page[], index: number): Page {
  const page = pages[index];
  if (!page) throw new Error(`Missing page ${index}`);
  return page;
}

export async function reloadAtHeading(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}
