import { expect, test, type Page } from "@playwright/test";

async function startCareer(page: Page, seed = 424242) {
  await page.goto(`/?seed=${seed}`);
  await page.getByTestId("new-career").click();
  await expect(page.getByTestId("day")).toHaveText("Day 1");
}

async function closeSummaryIfOpen(page: Page) {
  const btn = page.getByTestId("close-summary");
  if (await btn.isVisible()) await btn.click();
}

async function nextDay(page: Page) {
  await page.getByTestId("next-day").click();
  await closeSummaryIfOpen(page);
}

async function openTab(page: Page, view: "garage" | "market" | "history" | "settings") {
  const mobileTab = page.getByTestId(`tab-${view}`);
  if (await mobileTab.isVisible()) await mobileTab.click();
  else await page.getByRole("navigation").getByRole("button", { name: { garage: "Garage", market: "Market", history: "Books", settings: "Settings" }[view] }).first().click();
}

test("starts a career with 18 listings, each with a matching image", async ({ page }) => {
  await startCareer(page);
  await expect(page.getByTestId("cash")).toContainText("$15,000");
  await openTab(page, "market");
  const cards = page.getByTestId("listing-card");
  await expect(cards).toHaveCount(18);
  const images = page.locator("[data-testid=listing-card] [data-image-set]");
  await expect(images).toHaveCount(18);
});

test("progress survives a refresh and inspections cannot be rerolled", async ({ page }) => {
  await startCareer(page, 777);
  await openTab(page, "market");
  await page.getByTestId("listing-card").first().click();
  await page.getByTestId("inspect-testDrive").click();
  const notes = await page.getByTestId("knowledge").innerText();
  await page.reload();
  await expect(page.getByTestId("day")).toHaveText("Day 1");
  await openTab(page, "market");
  await page.getByTestId("listing-card").first().click();
  await expect(page.getByTestId("inspect-testDrive")).toBeDisabled();
  expect(await page.getByTestId("knowledge").innerText()).toBe(notes);
});

test("complete flipping loop: inspect, negotiate, buy, repair, advertise, sell", async ({ page }) => {
  await startCareer(page, 1234);
  await openTab(page, "market");

  // Choose the first listing within budget.
  const affordable = page.getByTestId("listing-card").filter({ hasNot: page.getByText("Over budget") });
  await affordable.first().click();
  await expect(page.getByTestId("listing-view")).toBeVisible();

  await page.getByTestId("ask-mechanical").click();
  await page.getByTestId("inspect-visual").click();
  await page.getByTestId("offer-asking").click();
  await page.getByTestId("make-offer").click();
  await expect(page.getByTestId("buy-panel")).toBeVisible();
  await page.getByTestId("buy").click();

  // After buying, the view switches to the owned car.
  await expect(page.getByTestId("owned-view")).toBeVisible();
  const detail = page.getByTestId("book-detail");
  if (await detail.isEnabled()) await detail.click();
  await nextDay(page);

  await openTab(page, "garage");
  await page.getByTestId("owned-card").first().click();
  await expect(page.getByTestId("advert-editor")).toBeVisible();
  // Price slightly under the estimate so buyers respond.
  const price = page.getByTestId("ad-price");
  const current = Number((await price.inputValue()).replace(/[^0-9.]/g, ""));
  await price.fill(String(Math.round(current * 0.85)));
  await page.getByTestId("list-for-sale").click();
  await expect(page.getByTestId("offers")).toBeVisible();

  for (let i = 0; i < 10; i++) {
    await nextDay(page);
    await openTab(page, "garage");
    await page.getByTestId("owned-card").first().click();
    if ((await page.getByTestId("accept-offer").count()) > 0) break;
  }
  await page.getByTestId("accept-offer").first().click();

  await openTab(page, "history");
  await expect(page.getByTestId("flip-record")).toHaveCount(1);
  await openTab(page, "garage");
  await expect(page.getByTestId("stat-profit")).toContainText("1 flip");
});

test("recovers from a corrupted save using the backup", async ({ page }) => {
  await startCareer(page, 99);
  await nextDay(page);
  await nextDay(page);
  await expect(page.getByTestId("day")).toHaveText("Day 3");
  await page.evaluate(() => localStorage.setItem("cft:save:main", "{corrupt"));
  await page.reload();
  await expect(page.getByTestId("day")).toHaveText("Day 2");
  await expect(page.getByText(/Restored the previous save/)).toBeVisible();
});

test("lays out without horizontal scrolling", async ({ page }) => {
  await startCareer(page, 5);
  for (const view of ["garage", "market", "history", "settings"] as const) {
    await openTab(page, view);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${view}`).toBeLessThanOrEqual(0);
  }
});
