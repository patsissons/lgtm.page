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

test("the cards can be sorted by update, creation or name", async ({
  page,
}) => {
  await stubApps(page);
  await page.goto("/");
  const titles = page.getByTestId("app-card").getByRole("heading");
  // Last updated, newest first, by default.
  await expect(titles).toHaveText(["Wavelength", "broken.lgtm.page"]);

  await page.getByRole("button", { name: "Newest first" }).click();
  await expect(titles).toHaveText(["broken.lgtm.page", "Wavelength"]);

  const sortBy = page.getByRole("combobox", { name: "Sort by" });
  await sortBy.selectOption({ label: "Created" });
  await expect(titles).toHaveText(["broken.lgtm.page", "Wavelength"]);
  await page.getByRole("button", { name: "Newest first" }).click();
  await expect(titles).toHaveText(["Wavelength", "broken.lgtm.page"]);

  await sortBy.selectOption({ label: "Name" });
  await expect(titles).toHaveText(["broken.lgtm.page", "Wavelength"]);
  await page.getByRole("button", { name: "A to Z" }).click();
  await expect(titles).toHaveText(["Wavelength", "broken.lgtm.page"]);
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
