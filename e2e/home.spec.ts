import { expect, test } from "@playwright/test";
import { CARDS, stubApps } from "./fixtures";

test("the home page lists every app as a card", async ({ page }) => {
  await stubApps(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "LGTM" }),
  ).toBeVisible();

  const cards = page.getByTestId("app-card");
  await expect(cards).toHaveCount(CARDS.length);

  const wavelength = cards.first();
  await expect(
    wavelength.getByRole("img", { name: "The Wavelength board" }),
  ).toBeVisible();
  await expect(
    wavelength.getByRole("link", { name: "Wavelength", exact: true }),
  ).toHaveAttribute("href", "https://wavelength.lgtm.page/");
  await expect(
    wavelength.getByRole("link", { name: "Wavelength source code" }),
  ).toHaveAttribute("href", "https://github.com/patsissons/wavelength");

  const broken = cards.nth(1);
  await expect(broken.getByTestId("app-card-placeholder")).toBeVisible();
  await expect(broken.getByText("unreachable")).toBeVisible();
});

test("clicking anywhere on a card opens the app", async ({ page }) => {
  await stubApps(page);
  await page.goto("/");
  const card = page.getByTestId("app-card").first();
  await expect(card.locator("img")).toBeVisible();
  // The title link is stretched over the card, so the image is a link too.
  await card.click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL("https://wavelength.lgtm.page/");
});

test("the page never scrolls sideways", async ({ page }) => {
  await stubApps(page);
  await page.goto("/");
  await expect(page.getByTestId("app-card")).toHaveCount(CARDS.length);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
