import { expect, test, type BrowserContext, type Page } from "@playwright/test";

test("Shirt Fight preserves an active mobile draft and submits fallback WebP across browser engines", async ({ browser, browserName }, testInfo) => {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    for (const [index, name] of ["Compat Host", "Compat Mobile", "Compat Third"].entries()) {
      const context = await browser.newContext({ reducedMotion: "reduce" });
      contexts.push(context);
      if (index === 1) {
        await context.addInitScript(() => {
          const nativeToBlob = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob")?.value as HTMLCanvasElement["toBlob"];
          HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
            return nativeToBlob.call(this, callback, type === "image/webp" ? "image/png" : type, quality);
          };
        });
      }
      const page = await context.newPage();
      pages.push(page);
      await page.setViewportSize({ width: 390, height: 844 });
      const roomCode = index === 0 ? null : await pages[0]?.locator(".room-banner h1").innerText();
      await page.goto(roomCode ? `/?room=${roomCode}` : "/");
      await page.getByLabel("Display name").fill(name);
      await page.getByRole("button", { name: roomCode ? "Join the fun" : "Create game" }).click();
      await expect(page.getByText("Players", { exact: true })).toBeVisible();
    }

    const host = pages[0] as Page;
    const mobile = pages[1] as Page;
    await Promise.all(pages.map((page) => expect(page.locator(".player-list li")).toHaveCount(3)));
    await host.getByRole("button", { name: /Shirt Fight/ }).click();
    await host.getByRole("button", { name: "Start game" }).click();
    await expect(mobile.getByRole("heading", { name: "Draw something unforgettable" })).toBeVisible();

    await drawStroke(mobile);
    await expectDraftPixel(mobile);
    await expectDrawingViewport(mobile);
    if (browserName === "chromium") await mobile.screenshot({ path: testInfo.outputPath("shirt-fight-portrait.png") });

    await mobile.goto("/");
    await expect(mobile.getByRole("heading", { name: "Draw something unforgettable" })).toBeVisible();
    await expect(mobile.getByText("Compat Mobile (you)")).toBeAttached();
    await expect(mobile.locator(".player-list li")).toHaveCount(3);
    await expectDraftPixel(mobile);

    await resizeViewport(mobile, { width: 844, height: 390 });
    await expectDrawingViewport(mobile);
    if (browserName === "chromium") await mobile.screenshot({ path: testInfo.outputPath("shirt-fight-landscape.png") });
    await resizeViewport(mobile, { width: 390, height: 844 });

    if (browserName === "chromium") {
      let intercepted = false;
      await mobile.route("**/shirt-fight/drawings", async (route) => {
        if (intercepted) return route.continue();
        intercepted = true;
        await route.fetch();
        await route.abort("failed");
      });
    }
    await mobile.getByRole("button", { name: "Lock drawing" }).click();
    await expect(mobile.getByRole("heading", { name: "Drawing locked" })).toBeVisible();
    expect(await mobile.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith("team-arcade:shirt-fight-draft:")).length)).toBe(0);

    await Promise.all([pages[0] as Page, pages[2] as Page].map((page) => page.getByRole("button", { name: "Lock drawing" }).click()));
    await expect(host.getByRole("heading", { name: "Draw something unforgettable" })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

async function drawStroke(page: Page): Promise<void> {
  const canvas = page.getByLabel("Shirt drawing canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Drawing canvas is not visible");
  await page.mouse.move(box.x + box.width * .25, box.y + box.height * .25);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .75, box.y + box.height * .75, { steps: 12 });
  await page.mouse.up();
}

async function expectDraftPixel(page: Page): Promise<void> {
  await expect.poll(() => page.getByLabel("Shirt drawing canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixel = canvas.getContext("2d")?.getImageData(300, 400, 1, 1).data;
    return pixel ? pixel[0] !== 255 || pixel[1] !== 255 || pixel[2] !== 255 : false;
  })).toBe(true);
}

async function expectDrawingViewport(page: Page): Promise<void> {
  const pageMetrics = await page.evaluate(() => ({
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight
  }));
  expect(pageMetrics.scrollWidth, JSON.stringify(pageMetrics)).toBeLessThanOrEqual(pageMetrics.innerWidth + 1);
  expect(pageMetrics.scrollHeight, JSON.stringify(pageMetrics)).toBeLessThanOrEqual(pageMetrics.innerHeight + 1);
  const canvas = await page.getByLabel("Shirt drawing canvas").boundingBox();
  const lock = await page.getByRole("button", { name: "Lock drawing" }).boundingBox();
  const viewport = page.viewportSize();
  expect(canvas?.width ?? 0).toBeGreaterThan(100);
  expect(canvas?.height ?? 0).toBeGreaterThan(100);
  expect((lock?.y ?? Infinity) + (lock?.height ?? Infinity)).toBeLessThanOrEqual((viewport?.height ?? 0) + 1);
}

async function resizeViewport(page: Page, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize(size);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await expect.poll(() => page.locator(".shirt-fight-room").evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(size.height);
}
