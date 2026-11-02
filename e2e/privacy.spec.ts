import { expect, test } from "@playwright/test";

// Google's OAuth consent screen links to this page; it must keep resolving
// at the extensionless URL (static assets map /privacy to privacy.html).
test("the privacy policy is served at /privacy", async ({ request }) => {
  const res = await request.get("/privacy");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/html");
  expect(await res.text()).toContain("auth.lgtm.page");
});
