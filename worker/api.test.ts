import { describe, expect, it } from "vitest";
import { handleApi } from "./api";

const ctx = { waitUntil: () => {} } as unknown as ExecutionContext;

function call(path: string, init?: RequestInit) {
  const url = new URL(`http://localhost${path}`);
  return handleApi(new Request(url, init), ctx, url);
}

describe("handleApi", () => {
  it("answers the health check", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    expect((await call("/api/nope")).status).toBe(404);
  });
});
