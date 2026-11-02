import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/lib/use-user";
import { AccountMenu } from "./account-menu";

const PAT: User = {
  sub: "github:42",
  provider: "github",
  name: "Pat Sissons",
  email: "pat@example.com",
  picture: "https://avatars.example/42",
  preferredUsername: "pat",
};

function mockMe(user: User | null) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify({ user }), {
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("AccountMenu", () => {
  it("offers GitHub and Google sign-in when signed out", async () => {
    const fetchMock = mockMe(null);
    render(<AccountMenu />);
    const trigger = await screen.findByRole("button", { name: "Sign in" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "same-origin" }),
    );
    await userEvent.click(trigger);
    expect(
      screen.getByRole("heading", { name: "Sign in to lgtm.page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Continue with GitHub" }),
    ).toHaveAttribute("href", "/api/auth/login?provider=github");
    expect(
      screen.getByRole("link", { name: "Continue with Google" }),
    ).toHaveAttribute("href", "/api/auth/login?provider=google");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the account and a sign-out form when signed in", async () => {
    mockMe(PAT);
    render(<AccountMenu />);
    const trigger = await screen.findByRole("button", { name: "Account" });
    expect(trigger).toHaveAttribute("title", "Pat Sissons");
    // Radix renders the fallback until the image loads; jsdom never loads it.
    expect(trigger).toHaveTextContent("PS");
    await userEvent.click(trigger);
    expect(
      screen.getByRole("heading", { name: "Account" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Signed in with GitHub.")).toBeInTheDocument();
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    const signOut = screen.getByRole("button", { name: "Sign out" });
    expect(signOut.closest("form")).toHaveAttribute(
      "action",
      "/api/auth/logout",
    );
    expect(signOut.closest("form")).toHaveAttribute("method", "post");
  });

  it("falls back to the username when there is no name or email", async () => {
    mockMe({ sub: "github:7", provider: "github", preferredUsername: "e2e" });
    render(<AccountMenu />);
    const trigger = await screen.findByRole("button", { name: "Account" });
    expect(trigger).toHaveTextContent("E");
    await userEvent.click(trigger);
    expect(screen.getByText("e2e")).toBeInTheDocument();
  });

  it("opens with the error from ?auth_error= and strips it from the URL", async () => {
    mockMe(null);
    window.history.replaceState(null, "", "/?auth_error=access_denied&x=1");
    render(<AccountMenu />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Sign-in was cancelled.");
    await waitFor(() => expect(window.location.search).toBe("?x=1"));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats a failed /api/auth/me as signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    render(<AccountMenu />);
    expect(
      await screen.findByRole("button", { name: "Sign in" }),
    ).toBeInTheDocument();
  });
});
