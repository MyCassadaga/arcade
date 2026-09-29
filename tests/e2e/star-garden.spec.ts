import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { TypedGameViewerState } from "@team-arcade/shared";
import { createRoomPlayers, requiredPage } from "./room-helpers";
type View = Extract<TypedGameViewerState, { gameId: "star-garden" }>;
declare global { interface Window { starGardenTestView?: View; starGardenTestSocket?: WebSocket; starGardenTestCommands: string[] } }
async function observe(page: Page) {
  await page.addInitScript(() => {
    const Native = window.WebSocket;
    window.starGardenTestCommands = [];
    window.WebSocket = class extends Native {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols); window.starGardenTestSocket = this;
        this.addEventListener("message", (event: MessageEvent<string>) => { const message = JSON.parse(event.data) as { type: string; payload: View }; if (message.type === "game.state" && message.payload.gameId === "star-garden") window.starGardenTestView = message.payload; });
      }
      override send(data: string | BufferSource | Blob) { if (typeof data === "string") window.starGardenTestCommands.push(data); super.send(data); }
    };
  });
}
async function view(page: Page): Promise<View> { return page.evaluate(() => { if (!window.starGardenTestView) throw Error("Missing garden view"); return window.starGardenTestView; }); }
async function revised(page: Page, previous: View) { await expect.poll(async () => { const next = await view(page); return next.private.revision > previous.private.revision || next.phase !== previous.phase; }).toBe(true); }
async function selectFirstCard(page: Page) {
  const current = await view(page), card = current.private.hand[0]!;
  await page.locator(".sg-card-list button").first().click();
  const board = page.getByRole("group", { name: "Your garden", exact: true });
  await board.getByRole("button").nth(0).click();
  if (["exchange", "blink", "echo"].includes(card.action)) await board.getByRole("button").nth(1).click();
  return current;
}
async function tabTo(page: Page, text: string) {
  for (let i = 0; i < 70; i++) {
    const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
    if (focused === text) return;
    await page.keyboard.press("Tab");
  }
  throw Error(`Could not tab to ${text}`);
}

test("Star Garden Daily: keyboard setup/tutorial, real run, previews/cancel, claim refresh/reconnect/share/replay at 320px and desktop", async ({ page }, testInfo) => {
  let dropNextCard = false, droppedAck = false, replayAck = false, lostCommand = "";
  await page.routeWebSocket("**/api/rooms/*/socket", (socket) => {
    const server = socket.connectToServer();
    let suppress = false;
    socket.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type: string; payload?: { command?: { type: string } } };
      if (dropNextCard && message.payload?.command?.type === "starGarden.playCard") {
        dropNextCard = false; suppress = true; lostCommand = String(raw);
      }
      server.send(raw);
    });
    server.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type: string; requestId?: string };
      const lostId = lostCommand ? (JSON.parse(lostCommand) as { requestId: string }).requestId : null;
      if (suppress) {
        // The real DO committed, but neither its snapshot nor ack reaches the browser.
        if (message.type === "command.ack" && message.requestId === lostId) {
          droppedAck = true; void socket.close({ code: 1012, reason: "Test lost acknowledgement" });
          void server.close();
        }
      } else {
        if (droppedAck && message.type === "command.ack" && message.requestId === lostId) replayAck = true;
        socket.send(raw);
      }
    });
  });
  await observe(page); await page.setViewportSize({ width: 320, height: 800 }); await page.goto("/");
  await page.getByRole("button", { name: "Play Star Garden solo" }).click();
  await expect(page.getByRole("heading", { name: "Your corner of the cosmos" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Daily/ })).toBeChecked();
  await expect(page.getByText("Room code", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Try the short tutorial" }).click();
  await page.getByRole("button", { name: "Select Exchange" }).click();
  const tutorial = page.getByRole("group", { name: "Tutorial garden" });
  await tutorial.getByRole("button").nth(1).click(); await tutorial.getByRole("button").nth(6).click();
  await page.getByRole("button", { name: "Confirm Exchange" }).click(); await page.getByRole("button", { name: "Claim Ember" }).click();
  await expect(page.getByText(/three scripted violet stars/)).toBeVisible(); expect((await view(page)).phase).toBe("setup");
  await page.getByRole("button", { name: "Close tutorial" }).click();
  await tabTo(page, "Begin"); await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Your garden", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const boxes = await page.locator('.sg-garden .sg-star').evaluateAll((nodes) => nodes.map((n) => ({ width: n.getBoundingClientRect().width, height: n.getBoundingClientRect().height })));
  expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("star-garden-mobile-playing.png"), fullPage: true });
  const initial = await selectFirstCard(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect((await view(page)).private).toEqual(initial.private);
  await page.reload(); await expect(page.getByRole("group", { name: "Your garden", exact: true })).toBeVisible(); expect((await view(page)).private).toEqual(initial.private);
  let claimReload = false, randomPreview = false;
  for (let i = 0; i < 110; i++) {
    const current = await view(page); if (current.phase === "gameResults") break;
    const match = page.locator(".sg-goal:not(:disabled)").first();
    if (await match.count()) {
      await match.click();
      const origins = page.locator(".sg-origins button"); if (await origins.count() > 1) await origins.last().click();
      await page.getByRole("button", { name: "Confirm claim" }).click(); await revised(page, current);
      if (!claimReload) { const claimed = await view(page); await page.reload(); await expect.poll(async () => (await view(page)).private.revision).toBe(claimed.private.revision); expect((await view(page)).private).toEqual(claimed.private); claimReload = true; }
    } else {
      await selectFirstCard(page);
      if (["collapse", "mutation"].includes(current.private.hand[0]!.action)) { await expect(page.getByRole("group", { name: "Preview, not committed" }).getByRole("button", { name: /unknown new star/ })).toHaveCount(1); randomPreview = true; }
      await page.getByRole("button", { name: "Confirm card" }).click(); await revised(page, current);
    }
  }
  await expect(page.getByRole("heading", { name: /Run complete|All 30 constellations/ })).toBeVisible();
  const final = await view(page); expect(final.private.actionsSpent).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Share result" }).click(); await expect(page.getByLabel("Plain-text result")).toContainText(/Star Garden Daily .*v1.*points.*constellations.*actions/);
  await page.screenshot({ path: testInfo.outputPath("star-garden-mobile-results.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 }); await page.getByRole("button", { name: "Daily Replay" }).click(); await page.getByRole("button", { name: "Begin", exact: true }).click();
  await expect(page.locator(".sg-header")).toContainText("Replay"); expect((await view(page)).private.board).toEqual(initial.private.board);
  const beforeLost = await selectFirstCard(page);
  dropNextCard = true;
  await page.getByRole("button", { name: "Confirm card" }).click();
  await expect.poll(() => droppedAck).toBe(true);
  await expect(page.locator(".connection-badge")).toContainText("Live", { timeout: 15000 });
  await expect.poll(async () => (await view(page)).private.revision).toBe(beforeLost.private.revision + 1);
  const committed = (await view(page)).private;
  expect(committed.actionsSpent).toBe(beforeLost.private.actionsSpent + 1);
  expect(committed.hand).toHaveLength(beforeLost.private.hand.length - 1);
  await page.evaluate((command) => window.starGardenTestSocket!.send(command), lostCommand);
  await expect.poll(() => replayAck).toBe(true);
  expect((await view(page)).private).toEqual(committed);
  await page.reload(); await expect(page.getByRole("group", { name: "Your garden", exact: true })).toBeVisible();
  expect((await view(page)).private).toEqual(committed);
  await page.screenshot({ path: testInfo.outputPath("star-garden-desktop-replay.png"), fullPage: true });
  await page.getByRole("button", { name: "End Run", exact: true }).click(); await page.getByRole("button", { name: "Keep playing" }).click();
  await page.getByRole("button", { name: "End Run", exact: true }).click(); await page.getByRole("button", { name: "Confirm End Run" }).click();
  await expect(page.getByRole("heading", { name: "Run complete" })).toBeVisible();
  testInfo.annotations.push({ type: "journey", description: `Natural Daily run: claim/reload=${claimReload}; random preview=${randomPreview}; ${final.private.score} points, ${final.private.goalsClaimed} goals, ${final.private.actionsSpent} actions. No solver or injected game state.` });
});

test("Star Garden Cup: two isolated clients complete six simultaneous rounds and reconnect", async ({ browser }, testInfo) => {
  const { contexts, pages } = await createRoomPlayers(browser, ["Luna", "Sol"]);
  const host = requiredPage(pages, 0), guest = requiredPage(pages, 1);
  try {
    for (const page of pages) { await observe(page); await page.reload(); }
    await host.getByRole("button", { name: /Star Garden Arrange/ }).click(); await host.getByRole("button", { name: "Start game", exact: true }).click();
    await expect(guest.getByText("Waiting for the host to Begin.")).toBeVisible(); await host.getByRole("button", { name: "Begin", exact: true }).click();
    await expect(guest.getByRole("group", { name: "Your garden", exact: true })).toBeVisible();
    expect((await view(host)).private.board).toEqual((await view(guest)).private.board); expect((await view(host)).private.hand).toEqual((await view(guest)).private.hand);
    for (let round = 1; round <= 6; round++) {
      for (const page of pages) {
        await expect.poll(async () => (await view(page)).public.roundNumber).toBe(round);
        await expect(page.getByRole("button", { name: "Done · no claim" })).toBeVisible();
        const current = await view(page), match = page.locator(".sg-goal:not(:disabled)").first();
        if (await match.count()) { await match.click(); await page.getByRole("button", { name: "Confirm claim" }).click(); }
        else { await selectFirstCard(page); await page.getByRole("button", { name: "Confirm card" }).click(); await revised(page, current); await page.getByRole("button", { name: "Done · no claim" }).click(); }
        if (page === host) {
          await expect(page.getByRole("heading", { name: "You're Done" })).toBeVisible();
          expect((await view(guest)).public.history).toHaveLength(round - 1);
        }
      }
      if (round === 1) { await guest.reload(); await expect(guest.getByRole("heading", { name: "Round 1 revealed" })).toBeVisible(); await host.screenshot({ path: testInfo.outputPath("star-garden-cup-reveal.png"), fullPage: true }); }
    }
    for (const page of pages) await expect(page.getByRole("heading", { name: "Cup results", exact: true })).toBeVisible();
    expect((await view(host)).public.history).toHaveLength(6); expect((await view(host)).public.standings).toEqual((await view(guest)).public.standings);
    await host.screenshot({ path: testInfo.outputPath("star-garden-cup-results.png"), fullPage: true });
    await host.getByRole("button", { name: "Back to arcade", exact: true }).click(); await expect(guest.getByRole("heading", { name: "Choose a game" })).toBeVisible();
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

test("Star Garden controlled browser fixture: keyboard multiple origins, claim/reload, Refresh and random preview", async ({ page }, testInfo) => {
  // A controlled visible-state fixture supplements the real DO journeys above.
  // All accepted fixture commands still run the production pure engine.
  const { createStarGardenState, handleStarGardenCommand, getStarGardenPublicView, getStarGardenPrivateView } = await import("@team-arcade/games/star-garden");
  const { clientMessageSchema, starGardenCommandSchema } = await import("@team-arcade/shared");
  const player = { id: "fixture", displayName: "Fixture", connected: true, isHost: true, score: 0 };
  const instance = "00000000-0000-4000-8000-000000000031";
  let state = createStarGardenState({ players: [player], now: Date.now(), random: () => 0 }, instance);
  state = handleStarGardenCommand(state, { type: "starGarden.begin", gameInstanceId: instance, roundNumber: 0, expectedRevision: 0, mode: "daily" }, player.id, Date.UTC(2026, 8, 28), true, "fixture").state;
  state.players.fixture!.board.fill(0); state.players.fixture!.hand = [
    { id: "crosswind-visual", action: "crosswind" },
    { id: "drift-visual", action: "drift" },
    { id: "mirror-visual", action: "mirror" },
    { id: "spin-visual", action: "spin" },
    { id: "mutation-visual", action: "mutation" }
  ]; state.lanes.easy = ["G01", ...state.lanes.easy.filter((id) => id !== "G01")];
  const session = { roomCode: "ABCDE", playerId: player.id, sessionToken: "f".repeat(43) };
  await page.route("**/api/rooms", (route) => route.fulfill({ json: session, status: 201 }));
  await page.route("**/api/rooms/ABCDE/session", (route) => route.fulfill({ json: { valid: true } }));
  await page.routeWebSocket("**/api/rooms/ABCDE/socket", (socket) => {
    const snapshot = () => {
      socket.send(JSON.stringify({ type: "room.snapshot", payload: { roomCode: "ABCDE", roomPhase: state.phase === "gameResults" ? "results" : "playing", selectedGameId: "star-garden", players: [player] } }));
      socket.send(JSON.stringify({ type: "game.state", payload: { gameId: "star-garden", phase: state.phase, public: getStarGardenPublicView(state), private: getStarGardenPrivateView(state, player.id) } }));
    };
    socket.onMessage((raw) => {
      const message = clientMessageSchema.parse(JSON.parse(String(raw)) as unknown);
      if (message.type === "game.command") state = handleStarGardenCommand(state, starGardenCommandSchema.parse(message.payload.command), player.id, Date.now(), true, "fixture").state;
      snapshot(); socket.send(JSON.stringify({ type: "command.ack", requestId: message.requestId, payload: { accepted: true } }));
    });
  });
  await page.setViewportSize({ width: 320, height: 800 }); await page.goto("/"); await page.getByRole("button", { name: "Play Star Garden solo" }).click();
  const ember = page.getByRole("button", { name: "Ember, 2 points, 6 matching origins" }); await expect(ember).toBeVisible();
  await ember.focus(); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Origin row 2 column 3" }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("img", { name: /Claim preview refill: stars follow the permanent path; unknown stars enter upstream/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("star-garden-mobile-claim-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Confirm claim" }).focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".sg-stats")).toContainText("2 points"); const claimed = structuredClone(state.players.fixture);
  await page.reload(); await expect(page.locator(".sg-stats")).toContainText("2 points"); expect(state.players.fixture).toEqual(claimed);
  await page.getByRole("button", { name: "Crosswind 1 action" }).click();
  await page.getByLabel("Top row direction").selectOption("left");
  await page.getByRole("group", { name: "Your garden", exact: true }).getByRole("button").first().click();
  await expect(page.getByRole("img", { name: /Crosswind preview: top row moves left; bottom row moves right.*wrap/ })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("star-garden-mobile-crosswind-preview.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("img", { name: /Crosswind preview/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Refresh · discard 3" }).click();
  for (let i = 0; i < 3; i++) await page.locator(".sg-card-list button").nth(i).click();
  await expect(page.getByRole("group", { name: "Preview, not committed" }).getByRole("button", { name: /unknown new star/ })).toHaveCount(10);
  await page.getByRole("button", { name: "Confirm Refresh" }).click(); await expect(page.locator(".sg-stats")).toContainText("3 actions spent");
  expect(state.players.fixture!.hand).toHaveLength(2); expect(state.players.fixture!.score).toBe(2);
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.locator(".sg-star svg").first().evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("star-garden-high-contrast-reduced-motion.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
