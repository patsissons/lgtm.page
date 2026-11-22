import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { appsVersion } from "@shared/apps";
import type { AppCard } from "@shared/types";
import App from "./App";

const card = (
  slug: string,
  created = "2026-01-01T00:00:00Z",
  updated = created,
): AppCard => ({
  slug,
  created,
  updated,
  url: `https://${slug}.lgtm.page/`,
  host: `${slug}.lgtm.page`,
  title: slug[0]!.toUpperCase() + slug.slice(1),
  image: `https://${slug}.lgtm.page/og.png`,
  status: "ok",
});

/** Answers /api/apps from `responses` in order; the visitor is signed out. */
function mockApps(...responses: Array<AppCard[] | number>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/auth/me") return Response.json({ user: null });
    const next = responses.shift() ?? [];
    return typeof next === "number"
      ? new Response("", { status: next })
      : Response.json(next);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("App", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the site name, tagline and skeletons while loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "LGTM" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Vibe-coded web apps. Looks good to me."),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("app-card-skeleton")).toHaveLength(3);
  });

  it("shows a card per app, most recently updated first", async () => {
    const fetchMock = mockApps([
      card("other", "2026-02-01T00:00:00Z"),
      card("wavelength", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
    ]);
    render(<App />);
    const list = await screen.findByRole("list", { name: "Apps" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Wavelength", "Other"]);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/apps?v=${appsVersion}`,
      expect.anything(),
    );
  });

  it("re-sorts the cards by the picked key and order", async () => {
    mockApps([
      card("bravo", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
      card("alpha", "2026-02-01T00:00:00Z"),
      card("charlie", "2026-01-15T00:00:00Z"),
    ]);
    render(<App />);
    await screen.findByRole("list", { name: "Apps" });
    const titles = () =>
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const select = screen.getByRole("combobox", { name: "Sort by" });
    expect(select).toHaveValue("updated");
    expect(titles()).toEqual(["Bravo", "Alpha", "Charlie"]);

    await userEvent.click(screen.getByRole("button", { name: "Newest first" }));
    expect(titles()).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(
      screen.getByRole("button", { name: "Oldest first" }),
    ).toHaveAttribute("title", "Switch to newest first");

    // A new key starts in its natural order: newest first.
    await userEvent.selectOptions(select, "Created");
    expect(titles()).toEqual(["Alpha", "Charlie", "Bravo"]);
    await userEvent.click(screen.getByRole("button", { name: "Newest first" }));
    expect(titles()).toEqual(["Bravo", "Charlie", "Alpha"]);

    // Names start A to Z.
    await userEvent.selectOptions(select, "Name");
    expect(titles()).toEqual(["Alpha", "Bravo", "Charlie"]);
    await userEvent.click(screen.getByRole("button", { name: "A to Z" }));
    expect(titles()).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(screen.getByRole("button", { name: "Z to A" })).toBeInTheDocument();
  });

  it("disables sorting until the apps load", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<App />);
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Newest first" })).toBeDisabled();
  });

  it("offers a retry when the list fails to load", async () => {
    mockApps(500, [card("wavelength")]);
    render(<App />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the apps.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: "Wavelength" }),
    ).toHaveAttribute("href", "https://wavelength.lgtm.page/");
  });
});
