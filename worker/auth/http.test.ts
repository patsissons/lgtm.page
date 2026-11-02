// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formBody, html, jsonNoStore, oauthError, redirect } from "./http";

describe("http helpers", () => {
  it("html pages are no-store and never framed", () => {
    const res = html("<p>hi</p>");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("redirects are 302 and no-store, with extra headers kept", () => {
    const res = redirect("https://app.lgtm.page/?code=1", {
      "set-cookie": "a=b",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.lgtm.page/?code=1");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBe("a=b");
  });

  it("oauth errors follow RFC 6749", async () => {
    const res = oauthError(401, "invalid_client", "nope", {
      "www-authenticate": "Basic",
    });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe("Basic");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: "invalid_client",
      error_description: "nope",
    });
    expect(jsonNoStore({ ok: 1 }).headers.get("pragma")).toBe("no-cache");
  });

  it("formBody only reads form-encoded bodies", async () => {
    const form = await formBody(
      new Request("https://auth.lgtm.page/token", {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        body: "a=1&b=2",
      }),
    );
    expect(form?.get("b")).toBe("2");
    expect(
      await formBody(
        new Request("https://auth.lgtm.page/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }),
      ),
    ).toBeNull();
  });
});
