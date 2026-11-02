// @vitest-environment node
import { describe, expect, it } from "vitest";
import { handleLogout } from "./logout";
import { SESSION_COOKIE } from "./session";

describe("/logout", () => {
  it("clears the session and redirects to a client's own origin", () => {
    const url = new URL(
      "https://auth.lgtm.page/logout?client_id=wavelength&post_logout_redirect_uri=https://wavelength.lgtm.page/bye",
    );
    const res = handleLogout(url);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://wavelength.lgtm.page/bye",
    );
    expect(res.headers.get("set-cookie")).toBe(
      `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`,
    );
  });

  it("shows a page instead of an open redirect", async () => {
    for (const query of [
      "",
      "post_logout_redirect_uri=https://wavelength.lgtm.page/",
      "client_id=wavelength&post_logout_redirect_uri=https://evil.example/",
      "client_id=nope&post_logout_redirect_uri=https://wavelength.lgtm.page/",
    ]) {
      const res = handleLogout(
        new URL(`https://auth.lgtm.page/logout?${query}`),
      );
      expect(res.status, query).toBe(200);
      expect(await res.text()).toContain("Signed out");
      expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    }
  });
});
