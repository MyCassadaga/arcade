import { expect, test, type Page } from "@playwright/test";
import { CAMPAIGN_WITNESSES } from "../../packages/games/src/ghost-circuit/campaign-witnesses";
import { GHOST_WITNESS_PATHS, layoutForPath } from "../../packages/games/src/ghost-circuit/witnesses";
import { coordinate, getGhostContract, type GhostContract } from "../../packages/games/src/ghost-circuit";
async function placeWitness(page: Page, path: string, contract?: GhostContract) {
 for (const piece of layoutForPath(path, contract)) {
  await page.locator(".gc-tray").getByRole("button", { name: new RegExp(piece.kind) }).click();
  await page.getByRole("button", { name: new RegExp(`^${coordinate(piece.cell)} empty socket`) }).click();
  for (let i = 0; i < (piece.rotation + 3) % 4; i++) await page.getByRole("button", { name: "Rotate ↻" }).click();
 }
}
async function selectContract(page: Page, id: string, title: string) {
 await page.getByRole("combobox", { name: "Contract" }).selectOption(id);
 await expect(page.locator(".gc-mission h2")).toHaveText(title);
}
async function reset(page: Page) { page.once("dialog", d => d.accept()); await page.getByRole("button", { name: "Reset layout" }).click(); }
test("Ghost Circuit: the mobile mission fits inside the paper at normal and doubled text size", async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/");
 await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click();
 await selectContract(page, "borrowed-identity", "Borrowed Identity");
 const mission = page.locator(".gc-mission");
 await expect(mission).toBeVisible();
 for (const fontSize of [16, 32]) {
  const style = await page.addStyleTag({ content: `html { font-size: ${fontSize}px; }` });
  for (const width of [320, 390, 430]) {
   await page.setViewportSize({ width, height: 844 });
   const layout = await mission.evaluate(element => {
    const border = getComputedStyle(element);
    const paper = element.getBoundingClientRect();
    const portrait = element.querySelector(".gc-portrait")!.getBoundingClientRect();
    const ink = [...element.querySelectorAll(".gc-briefing, .gc-objectives, .gc-rule-note")];
    return {
     titleSize: parseFloat(getComputedStyle(element.querySelector("h2")!).fontSize),
     pageFits: document.documentElement.scrollWidth <= innerWidth,
     textFits: ink.every(text => {
      const box = text.getBoundingClientRect();
      return text.scrollWidth <= text.clientWidth && box.left >= paper.left + parseFloat(border.borderLeftWidth) - 1 &&
       box.right <= paper.right - parseFloat(border.borderRightWidth) + 1 &&
       box.top >= paper.top + parseFloat(border.borderTopWidth) - 1 &&
       box.bottom <= paper.bottom - parseFloat(border.borderBottomWidth) + 1 &&
       (box.right <= portrait.left || box.left >= portrait.right || box.bottom <= portrait.top || box.top >= portrait.bottom);
     })
    };
   });
   expect(layout).toEqual({ titleSize: fontSize * (width === 320 ? 1.125 : 1.25), pageFits: true, textFits: true });
   await mission.screenshot({ path: testInfo.outputPath(`mission-${width}-${fontSize}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktop = page.locator(".gc-dossier");
  expect(await desktop.evaluate(element => {
   const title = element.querySelector("h2")!;
   const portrait = document.querySelector(".gc-portrait")!;
   return { titleSize: parseFloat(getComputedStyle(title).fontSize), fits: element.scrollWidth <= element.clientWidth &&
    element.scrollHeight <= element.clientHeight && element.getBoundingClientRect().bottom <= portrait.getBoundingClientRect().top };
  })).toEqual({ titleSize: fontSize * 1.6875, fits: true });
  await mission.screenshot({ path: testInfo.outputPath(`mission-1440-${fontSize}.png`) });
  await style.evaluate(node => { node.parentNode?.removeChild(node); });
 }
});
test("Ghost Circuit: keyboard edits, authoritative failure/correction/improvement, free replay and persisted summary", async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click();
 await expect(page.getByRole("heading", { name: "GHOST CIRCUIT" })).toBeVisible(); await selectContract(page, "borrowed-identity", "Borrowed Identity"); await expect(page.locator(".gc-counter strong")).toHaveText("0");
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
 await page.goto("/?play=ghost-circuit"); await expect(page.getByRole("button", { name: "Play Ghost Circuit solo" })).toBeVisible(); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click(); await expect(page.locator(".gc-counter strong")).toHaveText("0"); await selectContract(page, "borrowed-identity", "Borrowed Identity"); await expect(page.getByText(/New server session/)).toBeVisible(); await expect(page.locator(".gc-local-history")).toContainText("Full Haul");
});

test("Ghost Circuit: touch placement and explicit rotate/remove controls", async ({ browser }) => {
 const context = await browser.newContext({ viewport: { width: 320, height: 844 }, hasTouch: true });
 const page = await context.newPage(); await page.goto("/"); await page.getByRole("button", { name: "Play Ghost Circuit solo" }).tap(); await selectContract(page, "borrowed-identity", "Borrowed Identity");
 await page.getByRole("button", { name: /^B1 empty socket/ }).tap(); await page.getByRole("button", { name: "Rotate ↻" }).tap(); await expect(page.getByRole("button", { name: /B1 straight, ports S N/ })).toBeVisible();
 await page.getByRole("button", { name: "Remove ×" }).tap(); await expect(page.getByRole("button", { name: /^B1 empty socket/ })).toBeVisible();
 await page.getByRole("button", { name: "Undo", exact: true }).tap(); await expect(page.getByRole("button", { name: /B1 straight/ })).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await context.close();
});

test("Ghost Circuit campaign opens on a real tutorial and preserves independent drafts and progress through the finale", async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto("/");
 await page.getByRole("button", { name: "Play Ghost Circuit solo" }).click();
 const picker = page.getByRole("combobox", { name: "Contract" });
 await expect(page.locator(".gc-mission h2")).toHaveText("First Contact");
 await expect(picker.locator("optgroup")).toHaveCount(6);
 await expect(picker.locator("option")).toHaveCount(41);
 await expect(picker.locator("option:checked")).toContainText("Tutorial");
 const starter = CAMPAIGN_WITNESSES[0]!;
 await placeWitness(page, starter.full!, getGhostContract(starter.contractId));
 await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click();
 await expect(page.locator(".gc-result h2")).toHaveText("✓ Full Haul");
 await expect(picker.locator("option:checked")).toContainText("Full Haul");
 await expect(page.locator(".gc-status")).toContainText("Optional cache acquired");
 await page.getByRole("button", { name: "Next contract" }).click();
 await expect(page.locator(".gc-mission h2")).toHaveText("Borrowed Pass");
 await expect(page.locator(".gc-mission h2")).toBeFocused();
 await expect(page.locator(".gc-counter strong")).toHaveText("0");
 await page.getByRole("button", { name: /^B2 empty socket/ }).click();
 await selectContract(page, "the-glass-vault", "The Glass Vault");
 const final = CAMPAIGN_WITNESSES.at(-1)!, contract = getGhostContract(final.contractId);

 async function capture(state: string) {
  for (const width of [1440, 430, 390, 320]) {
   await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
   await page.evaluate(() => window.scrollTo(0, 0));
   expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
   await page.screenshot({ path: testInfo.outputPath(`campaign-${state}-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
 }
 await capture("planning");
 await placeWitness(page, final.trap, contract);
 await capture("selected");
 await page.emulateMedia({ reducedMotion: "reduce" });
 await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click();
 await expect(page.locator(".gc-status")).toHaveText(/^B5: Detected/);
 await expect(page.locator(".gc-counter strong")).toHaveText("1");
 await expect(page.getByRole("button", { name: /^B5 scanner/ })).toHaveClass(/gc-failed/);
 await capture("failure");
 await page.getByRole("button", { name: "Return to edit" }).click();
 await reset(page);
 await placeWitness(page, final.full!, contract);
 await page.getByRole("button", { name: "EXECUTE CIRCUIT →" }).click();
 await expect(page.locator(".gc-result h2")).toHaveText("✓ Full Haul");
 await expect(page.locator(".gc-counter strong")).toHaveText("2");
 await capture("success");
 await page.reload();
 await expect(page.locator(".gc-mission h2")).toHaveText("The Glass Vault");
 await expect(page.locator(".gc-counter strong")).toHaveText("2");
 await selectContract(page, "borrowed-pass", "Borrowed Pass");
 await expect(page.getByRole("button", { name: /^B2 straight/ })).toBeVisible();
 await expect(page.locator(".gc-counter strong")).toHaveText("0");
 await selectContract(page, "first-contact", "First Contact");
 await expect(page.locator(".gc-counter strong")).toHaveText("1");
 await expect(page.locator(".gc-result h2")).toHaveText("✓ Full Haul");
});
