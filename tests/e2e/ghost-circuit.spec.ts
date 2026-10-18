import { expect, test, type Page } from "@playwright/test";
import { GHOST_WITNESS_PATHS, layoutForPath } from "../../packages/games/src/ghost-circuit/witnesses";
import { coordinate } from "../../packages/games/src/ghost-circuit";
async function placeWitness(page: Page, path: string) {
 for (const piece of layoutForPath(path)) {
  await page.locator(".gc-tray").getByRole("button", { name: new RegExp(piece.kind) }).click();
  await page.getByRole("button", { name: new RegExp(`^${coordinate(piece.cell)} empty socket`) }).click();
  for (let i = 0; i < (piece.rotation + 3) % 4; i++) await page.getByRole("button", { name: "Rotate ↻" }).click();
 }
}
async function reset(page: Page) { page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Reset layout" }).click(); }
test("Ghost Circuit: keyboard edits, authoritative failure/correction/improvement, free replay and persisted summary", async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click();
 await expect(page.getByRole("heading", { name: "GHOST CIRCUIT" })).toBeVisible(); await expect(page.locator(".gc-counter strong")).toHaveText("0");
 await page.setViewportSize({ width: 1440, height: 900 });
 const cabinet = await page.locator(".gc-shell").boundingBox(), board = await page.locator(".gc-board").boundingBox(), portrait = await page.locator(".gc-portrait").boundingBox();
 expect(await page.locator(".gc-portrait img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
 expect(cabinet!.width).toBeGreaterThanOrEqual(1180); expect(cabinet!.width).toBeLessThanOrEqual(1260); expect(board!.width).toBeGreaterThanOrEqual(550); expect(board!.width).toBeLessThanOrEqual(600); expect(portrait!.height).toBeGreaterThanOrEqual(220); expect(portrait!.height).toBeLessThanOrEqual(280);
 await page.screenshot({ path: testInfo.outputPath("ghost-circuit-initial-1440.png"), fullPage: true });
 await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: testInfo.outputPath("ghost-circuit-initial-390.png"), fullPage: true });
 await page.setViewportSize({ width: 320, height: 844 }); await page.screenshot({ path: testInfo.outputPath("ghost-circuit-initial-320.png"), fullPage: true }); await page.setViewportSize({ width: 390, height: 844 });
 const b1 = page.getByRole("button", { name: /^B1 empty/ }); await b1.focus(); await b1.press("Enter"); await page.keyboard.press("r"); await expect(page.getByRole("button", { name: /B1 straight, ports S N/ })).toBeVisible();
 for (const width of [1440,390,320]) { await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await page.screenshot({ path: testInfo.outputPath(`ghost-circuit-selected-${width}.png`), fullPage: true }); }
 await page.setViewportSize({width:390,height:844}); await page.getByRole("button", {name:/B1 straight/}).focus(); await page.keyboard.press("Delete"); await expect(b1).toBeVisible();
 await placeWitness(page, GHOST_WITNESS_PATHS.detected); await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click(); await expect(page.locator(".gc-counter strong")).toHaveText("1");
 await page.getByRole("button", { name: "Pause", exact: true }).click(); const paused = await page.locator(".gc-status").innerText(); await page.waitForTimeout(450); await expect(page.locator(".gc-status")).toHaveText(paused); await page.getByRole("button", { name: "Step", exact: true }).click(); await expect(page.locator(".gc-status")).not.toHaveText(paused); await expect(page.locator(".gc-counter strong")).toHaveText("1");
 await expect(page.locator(".gc-result")).toContainText("Detected");
 for (let i=0; i<100 && await page.getByRole("button", {name:"Step",exact:true}).isEnabled(); i++) await page.getByRole("button", {name:"Step",exact:true}).click();
 await expect(page.locator(".gc-status")).toContainText("Detected");
 for (const width of [1440,390,320]) { await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); await page.screenshot({ path: testInfo.outputPath(`ghost-circuit-failure-${width}.png`), fullPage: true }); }
 await page.setViewportSize({width:390,height:844}); await page.getByRole("button", { name: "Return to edit" }).click(); await reset(page);
 await placeWitness(page, GHOST_WITNESS_PATHS.basic); await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click(); await expect(page.locator(".gc-result h2")).toHaveText("✓ Basic"); await expect(page.locator(".gc-counter strong")).toHaveText("2");
 await page.getByRole("button", { name: "Return to edit" }).click(); await page.reload(); await expect(page.locator(".gc-counter strong")).toHaveText("2"); await expect(page.getByRole("button", { name: "EXECUTE CIRCUIT →" })).toBeEnabled();
 await reset(page); await placeWitness(page, GHOST_WITNESS_PATHS.full); await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click(); await expect(page.locator(".gc-result h2")).toHaveText("✓ Full Haul"); await expect(page.locator(".gc-result")).toContainText("first escape: execution 2"); await page.getByRole("button", { name: "Return to edit" }).click();
 await page.getByRole("button", { name: "Share result" }).click(); await expect(page.getByRole("textbox", { name: "Spoiler-free result" })).toHaveValue(/Full Haul · 3 executions/);
 await page.screenshot({ path: testInfo.outputPath("ghost-circuit-mobile-full.png"), fullPage: true });
 for (const width of [320, 1440]) { await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); if (width === 320) { const cell = await page.locator(".gc-cell").first().boundingBox(); expect(cell!.width).toBeGreaterThanOrEqual(48); }
 if (width === 1440) {
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const selector of [".gc-board", ".gc-tray", ".gc-execute", ".gc-mission h2"]) { const box = await page.locator(selector).first().boundingBox(); expect(box).not.toBeNull(); expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(900); }
 } await page.screenshot({ path: testInfo.outputPath(`ghost-circuit-${width}.png`), fullPage: true }); }
 const before = await page.locator(".gc-counter strong").innerText();
 await page.getByRole("button", { name: /B1 straight/ }).focus(); await page.getByRole("button", { name: "Remove ×" }).click();
 await expect(page.getByRole("button", { name: /^B1 empty socket/ })).toBeVisible();
 await expect(page.locator(".gc-tray").getByRole("button", { name: /straight/ })).toContainText("1 left");
 await page.getByRole("button", { name: "Replay latest" }).click();
 await expect(page.getByRole("button", { name: /B1 straight/ })).toBeVisible();
 await expect(page.locator(".gc-tray").getByRole("button", { name: /straight/ })).toContainText("0 left");
 await page.getByRole("button", { name: "Return to edit" }).click();
 await expect(page.getByRole("button", { name: /^B1 empty socket/ })).toBeVisible();
 await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(page.getByRole("button", { name: /B1 straight/ })).toBeVisible();
 await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(page.getByRole("button", { name: /^B1 empty socket/ })).toBeVisible();
 await expect(page.locator(".gc-counter strong")).toHaveText(before);
});
test("Ghost Circuit: unavailable storage still launches and reduced-motion execution remains usable", async ({ page }) => {
 await page.emulateMedia({ reducedMotion: "reduce" }); await page.addInitScript(() => { for (const method of ["getItem", "setItem", "removeItem"] as const) Storage.prototype[method] = () => { throw Error("Storage denied"); }; });
 await page.goto("/"); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click(); await expect(page.getByText(/Progress won't be saved/)).toBeVisible();
 await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click(); await expect(page.locator(".gc-status")).toContainText("Missing cable"); await expect(page.locator(".gc-counter strong")).toHaveText("1"); await page.getByRole("button", { name: "Return to edit" }).click(); await page.getByRole("button", { name: "Back to arcade", exact: true }).click(); await expect(page.getByRole("button", { name: "Play Ghost Circuit solo" })).toBeVisible();
});
test("Ghost Circuit: expired authority clears while noncompetitive completion history survives", async ({ page }) => {
 await page.addInitScript(() => { localStorage.setItem("team-arcade:solo-room:ghost-circuit", "ABCDE"); localStorage.setItem("team-arcade:session:ABCDE", JSON.stringify({ roomCode: "ABCDE", playerId: "expired", sessionToken: "expired-token-with-valid-length-0001" })); localStorage.setItem("team-arcade:ghost-circuit:summary:borrowed-identity:1:1", JSON.stringify({ version: 1, contentVersion: 1, rulesVersion: 1, completed: true, bestRating: "Full Haul" })); });
 await page.goto("/?play=ghost-circuit"); await expect(page.getByRole("button", { name: "Play Ghost Circuit solo" })).toBeVisible(); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click(); await expect(page.locator(".gc-counter strong")).toHaveText("0"); await expect(page.getByText(/New server session/)).toBeVisible(); await expect(page.locator(".gc-local-history")).toContainText("Full Haul");
});

test("Ghost Circuit: touch placement and explicit rotate/remove controls", async ({ browser }) => {
 const context = await browser.newContext({ viewport: { width: 320, height: 844 }, hasTouch: true });
 const page = await context.newPage(); await page.goto("/"); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).tap();
 await page.getByRole("button", { name: /^B1 empty socket/ }).tap(); await page.getByRole("button", { name: "Rotate ↻" }).tap(); await expect(page.getByRole("button", { name: /B1 straight, ports S N/ })).toBeVisible();
 await page.getByRole("button", { name: "Remove ×" }).tap(); await expect(page.getByRole("button", { name: /^B1 empty socket/ })).toBeVisible();
 await page.getByRole("button", { name: "Undo", exact: true }).tap(); await expect(page.getByRole("button", { name: /B1 straight/ })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await context.close();
});
