import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { TypedGameViewerState } from "@team-arcade/shared";
type Garden = Extract<TypedGameViewerState, { gameId: "star-garden" }>;
async function snapshot(page: Page): Promise<Garden> { return page.evaluate(() => (window as unknown as { polishView: Garden }).polishView); }
async function observe(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native { constructor(url: string | URL, protocols?: string | string[]) { super(url, protocols); this.addEventListener("message", (event: MessageEvent<string>) => { const message = JSON.parse(event.data) as { type: string; payload: { gameId?: string } }; if (message.type === "game.state" && message.payload.gameId === "star-garden") (window as unknown as { polishView: unknown }).polishView = message.payload; }); } };
  });
}
const sizes = [["narrow", 320, 740], ["phone", 390, 844], ["tablet", 768, 1024], ["laptop", 1366, 768], ["wide", 1920, 1080]] as const;
for (const [name, width, height] of sizes) test(`Star Garden polish: ${name} compact Practice, keyboard, cancellation and recovery`, async ({ page }, info) => {
  await observe(page); await page.setViewportSize({ width, height }); await page.goto("/");
  const picker = await page.locator(".solo-game-card").evaluateAll((nodes) => nodes.map((node) => { const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
  expect(picker.length).toBeGreaterThan(1); for (let i = 1; i < picker.length; i++) expect(picker[i]!.top - picker[i - 1]!.bottom).toBeGreaterThanOrEqual(10);
  await page.getByRole("button", { name: "Play Star Garden solo" }).click(); await page.getByRole("radio", { name: /Solo Practice/ }).check(); await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(page.getByRole("group", { name: "Your garden", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Refill flow: across the top row from left to right.*bottom row from right to left/ })).toBeVisible();
  await page.locator(".sg-shell").evaluate((node) => Promise.all(node.getAnimations({ subtree: true }).map((a) => a.finished)));
  const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, hand: document.querySelector(".sg-hand")!.getBoundingClientRect().bottom, board: document.querySelector(".sg-garden")!.getBoundingClientRect().bottom, targets: [...document.querySelectorAll(".sg-garden button,.sg-card-list button,.sg-goal")].map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })) }));
  expect(geometry.width).toBe(width); expect(geometry.hand).toBeLessThan(height); expect(geometry.board).toBeLessThan(height);
  expect(geometry.targets.every((r) => r.w >= 44 && r.h >= 44)).toBe(true);
  if (width < 800) {
    const cards = page.locator(".sg-card-list button"), lastCard = cards.last(); await cards.first().focus();
    for (let i = 1; i < await cards.count(); i++) await page.keyboard.press("Tab");
    await expect(lastCard).toBeFocused();
    await expect.poll(() => lastCard.evaluate((node) => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })).toBe(true);
    await page.locator(".sg-card-list button").first().focus(); await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.screenshot({ path: info.outputPath(`${name}-practice.png`), fullPage: true });
  const patternKey = page.locator(".sg-pattern-key summary"); await patternKey.focus(); await page.keyboard.press("Enter"); await expect(page.getByText("Same letter = same kind. A and B differ. Dots don’t matter. Orientation is fixed.")).toBeVisible(); await page.keyboard.press("Enter");
  await page.locator(".sg-reference > summary").last().click(); await expect(page.getByText(/Reverse one row/)).toBeVisible(); await page.locator(".sg-reference > summary").last().click();
  // Three real server-generated Practice moves at every viewport; no fixture state.
  for (let turn = 0; turn < 3; turn++) {
    const before = await snapshot(page), card = before.private.hand[0]!;
    const action = page.locator(".sg-card-list button").first(); await action.focus(); await page.keyboard.press("Enter");
    await expect(action).toHaveAttribute("aria-pressed", "true");
    if (turn === 0) {
      await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect((await snapshot(page)).private).toEqual(before.private); await expect(action).toBeFocused();
      await page.keyboard.press("Enter"); await page.locator(".sg-action-help summary").click(); await expect(page.locator(".sg-action-help p")).toBeVisible(); await page.locator(".sg-action-help summary").click();
    }
    const board = page.getByRole("group", { name: "Your garden", exact: true }); const target = board.getByRole("button").nth(0);
    await page.keyboard.press("Tab"); await target.focus(); await expect(target).toBeFocused(); expect(await target.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none"); await page.keyboard.press("Enter");
    if (["exchange", "blink", "echo"].includes(card.action)) { await board.getByRole("button").nth(1).focus(); await page.keyboard.press("Enter"); }
    await expect(page.getByRole("group", { name: "Preview, not committed" })).toBeVisible();
    if (["mutation", "collapse"].includes(card.action)) await expect(page.getByRole("group", { name: "Preview, not committed" }).getByRole("button", { name: /unknown new star/ })).toHaveCount(1);
    if (width >= 390 && width !== 768) {
      const confirmBottom = await page.getByRole("button", { name: "Confirm card" }).evaluate((node) => node.getBoundingClientRect().bottom + window.scrollY);
      expect(confirmBottom).toBeLessThanOrEqual(height);
    }
    if (turn === 0) { await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath(`${name}-preview.png`), fullPage: true }); }
    const confirm = page.getByRole("button", { name: "Confirm card" }); await confirm.focus(); await page.keyboard.press("Enter");
    await expect.poll(async () => (await snapshot(page)).private.revision).toBe(before.private.revision + 1);
    expect((await snapshot(page)).private.actionsSpent).toBe(turn + 1); expect((await snapshot(page)).private.hand).toHaveLength(4 - turn);
    await expect(page.locator(".sg-table :focus")).toHaveCount(1);
  }
  const committed = (await snapshot(page)).private; await page.reload(); await expect(page.getByRole("group", { name: "Your garden", exact: true })).toBeVisible(); expect((await snapshot(page)).private).toEqual(committed);
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  expect(await page.locator(".sg-piece-art").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await page.screenshot({ path: info.outputPath(`${name}-contrast.png`), fullPage: true });
});
