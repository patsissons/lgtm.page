import { describe, expect, it } from "vitest";
import { wwwRedirect } from "./index";

describe("wwwRedirect", () => {
  it("sends www to the apex, keeping the path and query", () => {
    const res = wwwRedirect(new URL("https://www.lgtm.page/a/b?c=1#d"));
    expect(res?.status).toBe(301);
    expect(res?.headers.get("location")).toBe("https://lgtm.page/a/b?c=1#d");
  });

  it("leaves the apex alone", () => {
    expect(wwwRedirect(new URL("https://lgtm.page/"))).toBeNull();
    expect(wwwRedirect(new URL("http://localhost:5173/"))).toBeNull();
  });
});
