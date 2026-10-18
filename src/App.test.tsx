import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppCard } from "@shared/types";
import App from "./App";

const card = (slug: string): AppCard => ({
  slug,
  url: `https://${slug}.lgtm.page/`,
  host: `${slug}.lgtm.page`,
  title: slug[0]!.toUpperCase() + slug.slice(1),
  image: `https://${slug}.lgtm.page/og.png`,
  status: "ok",
});

function mockApps(...responses: Array<AppCard[] | number>) {
  const fetchMock = vi.fn(async () => {
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

  it("shows a card per app, in order", async () => {
    const fetchMock = mockApps([card("wavelength"), card("other")]);
    render(<App />);
    const list = await screen.findByRole("list", { name: "Apps" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent),
    ).toEqual(["Wavelength", "Other"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/apps", expect.anything());
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
