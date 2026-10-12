import { expect, test } from "@playwright/test";

test("the Worker answers its health check and rejects unknown routes", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
  expect((await request.get("/api/nope")).status()).toBe(404);
});
