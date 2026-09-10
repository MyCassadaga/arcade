import { createRoomPlayers, requiredPage, reloadAtHeading } from "./room-helpers";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByRole("button", { name: /Impostor/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /System Crawl/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("an idle client stays silent, disconnects at 15 minutes, and explicitly restores authoritative state", async ({ page }) => {
  await page.clock.install();
  const sockets: Array<{ url: string; sent: string[] }> = [];
  page.on("websocket", (socket) => {
    const observed = { url: socket.url(), sent: [] as string[] };
    sockets.push(observed);
    socket.on("framesent", (event) => {
      if (typeof event.payload === "string") observed.sent.push(event.payload);
    });
  });

  await page.goto("/");
  await page.getByLabel("Display name").fill("Idle Host");
  await page.getByRole("button", { name: "Create game" }).click();
  await expect(page.locator(".connection-badge")).toHaveText(/Live/u);
  const roomCode = await page.locator(".room-banner h1").innerText();
  await expect.poll(() => sockets.length).toBe(1);
  await expect.poll(() => sockets[0]?.sent.length).toBe(1);
  expect(JSON.parse(sockets[0]?.sent[0] ?? "{}")).toMatchObject({ type: "room.reconnect" });

  await page.clock.fastForward(15 * 60 * 1_000 - 1);
  expect(sockets[0]?.sent).toHaveLength(1);
  await page.clock.fastForward(1);
  await expect(page.getByText("Disconnected for inactivity.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect" })).toBeVisible();
  expect(sockets[0]?.sent).toHaveLength(1);

  await page.clock.fastForward(60_000);
  expect(sockets).toHaveLength(1);
  await page.getByRole("button", { name: "Reconnect" }).click();
  await expect.poll(() => sockets.length).toBe(2);
  await expect(page.locator(".connection-badge")).toHaveText(/Live/u);
  await expect(page.locator(".room-banner h1")).toHaveText(roomCode);
});

test("two players synchronize a System Crawl move and ability across desktop and phone layouts", async ({ browser }) => {
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    await guest.setViewportSize({ width: 390, height: 844 });
    await host.goto("/");
    await host.getByLabel("Display name").fill("Crawl Host");
    await host.getByRole("button", { name: "Create game" }).click();
    const roomCode = await host.locator(".room-banner h1").innerText();

    await guest.goto(`/?room=${roomCode}`);
    await guest.getByLabel("Display name").fill("Crawl Guest");
    await guest.getByRole("button", { name: "Join the fun" }).click();
    await Promise.all([host, guest].map((page) => expect(page.locator(".player-list li")).toHaveCount(2)));

    await selectHiddenGame(host, "system-crawl");
    await host.getByRole("button", { name: "Start game" }).click();
    await Promise.all([host, guest].map((page) => expect(page.getByRole("heading", { name: "Assemble the response team" })).toBeVisible()));
    await Promise.all([host, guest].map(async (page) => {
      const closeTutorial = page.getByRole("button", { name: "Close" });
      if (await closeTutorial.isVisible()) await closeTutorial.click();
    }));

    await host.getByRole("button", { name: /Application Developer/ }).click();
    await guest.getByRole("button", { name: /Infrastructure Architect/ }).click();
    await expect(host.getByRole("button", { name: "Initialize adventure" })).toBeVisible();
    await host.getByRole("button", { name: "Initialize adventure" }).click();
    await expect(host.getByText("INCIDENT TICKET / AWAITING HOST ACKNOWLEDGEMENT")).toBeVisible();
    await expect(guest.getByText(/Waiting for the host to acknowledge/)).toBeVisible();
    await host.getByRole("button", { name: "Acknowledge and deploy" }).click();
    await Promise.all([host, guest].map((page) => expect(page.getByRole("heading", { name: "System topology" })).toBeVisible()));
    await expect(host.getByRole("heading", { name: "Visible threats" })).toBeVisible();
    await expect(host.getByText(/ITEM CACHE — step onto it/)).toBeVisible();
    expect(await host.locator(".sc-cache-entity").evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
    await expectStableViewport(host);

    const firstClass = await host.locator(".sc-incident-bar dd").nth(1).innerText();
    const firstPage = firstClass === "Application Developer" ? host : guest;
    const secondPage = firstPage === host ? guest : host;
    await expectStableViewport(host);
    await expectStableViewport(guest);
    const destination = firstPage.getByRole("gridcell", { name: /valid movement destination/i }).first();
    await destination.click();
    await Promise.all([host, guest].map((page) => expect(page.getByText("character moved", { exact: true })).toHaveCount(1)));

    const abilityName = firstClass === "Application Developer" ? /Works on My Machine/ : /Firewall/;
    const targetName = firstClass === "Application Developer" ? /valid works on my machine target/i : /valid firewall target/i;
    await firstPage.getByRole("button", { name: abilityName }).click();
    await firstPage.getByRole("gridcell", { name: targetName }).first().click();
    await Promise.all([host, guest].map((page) => expect(page.getByText("ability used", { exact: true })).toHaveCount(1)));
    await expectStableViewport(firstPage);
    await expect(firstPage.getByRole("button", { name: "End Turn" })).toBeEnabled();
    await expect(secondPage.getByRole("button", { name: /End Turn/ })).toBeDisabled();
    await firstPage.getByRole("button", { name: "End Turn" }).click();

    await expect(secondPage.locator(".sc-incident-bar dd").nth(1)).not.toHaveText(firstClass);
    await expect(guest.locator(".sc-board-console")).toBeVisible();
    await expect(guest.locator(".sc-hud")).toBeVisible();
    await expect(secondPage.getByRole("button", { name: "End Turn and Reboot" })).toBeEnabled();
    expect(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await expectStableViewport(guest);
    await secondPage.getByRole("button", { name: "End Turn and Reboot" }).click();
    await Promise.all([host, guest].map((page) => expect(page.locator(".sc-incident-bar dd").first()).toHaveText("2")));

    await guest.reload();
    await expect(guest.getByRole("heading", { name: "System topology" })).toBeVisible();
    await expect(guest.locator(".sc-incident-bar dd").first()).toHaveText("2");
    await expect(guest.getByRole("img", { name: /Application Developer.*character sprite/ })).toBeVisible();
    await expect(guest.locator(".sc-incident-bar dd").nth(1)).toHaveText(await host.locator(".sc-incident-bar dd").nth(1).innerText());
  } finally {
    await Promise.all([hostContext.close(), guestContext.close()]);
  }
});

test("solo System Crawl controls two characters through briefing and reconnect", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Display name").fill("Solo Crawler");
  await page.getByRole("button", { name: "Create game" }).click();
  await selectHiddenGame(page, "system-crawl");
  await page.getByRole("button", { name: "Start game" }).click();
  await expect(page.getByRole("heading", { name: "Assemble the response team" })).toBeVisible();
  const closeTutorial = page.getByRole("button", { name: "Close" });
  await expect(closeTutorial).toBeVisible();
  await closeTutorial.click();
  await page.getByRole("button", { name: /Infrastructure Architect/ }).click();
  await page.getByRole("button", { name: /Application Developer/ }).click();
  await page.getByRole("button", { name: "Save two operators" }).click();
  await page.getByRole("button", { name: "Initialize adventure" }).click();
  await expect(page.getByText("INCIDENT TICKET / AWAITING HOST ACKNOWLEDGEMENT")).toBeVisible();
  await page.getByRole("button", { name: "Acknowledge and deploy" }).click();
  await expect(page.locator(".sc-owned-characters .sc-character-card")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "System topology" })).toBeVisible();
  const boardTop = await page.locator(".sc-board-console").evaluate((element) => element.getBoundingClientRect().top);
  const firstOperator = await page.locator(".sc-incident-bar dd").nth(1).innerText();
  await page.getByRole("gridcell", { name: /valid movement destination/i }).first().click();
  await expect.poll(() => page.locator(".sc-board-console").evaluate((element) => element.getBoundingClientRect().top)).toBe(boardTop);
  await page.getByRole("button", { name: "End Turn and Reboot" }).click();
  await expect(page.locator(".sc-incident-bar dd").nth(1)).not.toHaveText(firstOperator);
  await expect(page.locator(".sc-waiting")).toHaveCount(0);
  await expect.poll(() => page.locator(".sc-board-console").evaluate((element) => element.getBoundingClientRect().top)).toBe(boardTop);
  await page.reload();
  await expect(page.locator(".sc-owned-characters .sc-character-card")).toHaveCount(2);
});

test("seven players complete Who Said That and an Impostor round without losing private state", async ({ browser }) => {
  const { contexts, pages } = await createRoomPlayers(browser, playerNames);
  try {
    const host = requiredPage(pages, 0);
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

async function expectStableViewport(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true);
  await expect.poll(() => page.locator(".system-crawl-room").evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.locator(".system-crawl-room").evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
}

async function selectHiddenGame(page: Page, gameId: "system-crawl"): Promise<void> {
  await expect(page.getByRole("heading", { name: "Choose a game" })).toBeVisible();
  await page.evaluate(async (selectedGameId) => {
    const roomCode = new URLSearchParams(window.location.search).get("room");
    const storedSession = roomCode ? localStorage.getItem(`team-arcade:session:${roomCode}`) : null;
    if (!roomCode || !storedSession) throw new Error("Missing host room session");

    const session = JSON.parse(storedSession) as { sessionToken?: string };
    if (!session.sessionToken) throw new Error("Missing host session token");

    await new Promise<void>((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomCode)}/socket`);
      const timeout = window.setTimeout(() => {
        socket.close();
        reject(new Error("Timed out selecting hidden game"));
      }, 10_000);

      const finish = (error?: Error) => {
        window.clearTimeout(timeout);
        socket.close();
        if (error) reject(error);
        else resolve();
      };

      socket.addEventListener("open", () => {
        socket.send(JSON.stringify({
          type: "room.reconnect",
          requestId: crypto.randomUUID(),
          payload: { sessionToken: session.sessionToken }
        }));
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as {
          type?: string;
          payload?: { selectedGameId?: string; message?: string };
        };
        if (message.type === "room.snapshot") {
          socket.send(JSON.stringify({
            type: "host.selectGame",
            requestId: crypto.randomUUID(),
            payload: { gameId: selectedGameId }
          }));
        } else if (message.type === "room.presence" && message.payload?.selectedGameId === selectedGameId) {
          finish();
        } else if (message.type === "error") {
          finish(new Error(message.payload?.message ?? "Hidden game selection failed"));
        }
      });
      socket.addEventListener("error", () => finish(new Error("Hidden game selection socket failed")));
    });
  }, gameId);
}
