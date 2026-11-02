import { expect, test } from "@playwright/test";
import { stubApps } from "./fixtures";

// The index signs in through the path-mounted broker and the stub provider
// (see auth.spec.ts), so this is the real cookie dance end to end.

interface Me {
  user: { sub: string; provider: string; preferredUsername?: string } | null;
}

test("offers GitHub and Google sign-in from the header", async ({ page }) => {
  await stubApps(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to lgtm.page" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue with GitHub" }),
  ).toHaveAttribute("href", "/api/auth/login?provider=github");
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toHaveAttribute("href", "/api/auth/login?provider=google");
});

test("signs in with GitHub, shows the account and signs out", async ({
  page,
}) => {
  await stubApps(page);
  await page.goto("/api/auth/login?provider=github");
  await page.waitForURL("http://localhost:5198/");

  const account = page.getByRole("button", { name: "Account" });
  await expect(account).toBeVisible();
  await expect(account).toHaveAttribute("title", "Pat E2E");
  const me = (await (await page.request.get("/api/auth/me")).json()) as Me;
  expect(me.user).toMatchObject({
    sub: "github:7",
    provider: "github",
    preferredUsername: "e2e-pat",
  });

  await account.click();
  await expect(page.getByText("Signed in with GitHub.")).toBeVisible();
  await expect(page.getByText("pat@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("http://localhost:5198/");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  const after = (await (await page.request.get("/api/auth/me")).json()) as Me;
  expect(after.user).toBeNull();

  // Signing out also ended the broker session: the chooser is back.
  await page.goto("/api/auth/login");
  await expect(
    page.getByRole("heading", { name: "Sign in to lgtm" }),
  ).toBeVisible();
});

test("a cancelled sign-in is reported in the dialog", async ({ page }) => {
  await stubApps(page);
  const start = await page.request.get("/api/auth/login?provider=google", {
    maxRedirects: 0,
  });
  const state = new URL(start.headers().location!).searchParams.get("state");
  await page.goto(`/api/auth/callback?error=access_denied&state=${state}`);
  await page.waitForURL("http://localhost:5198/");
  await expect(page.getByRole("alert")).toHaveText(/cancelled/);
  expect(new URL(page.url()).searchParams.has("auth_error")).toBe(false);
});
