import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AppCard as AppCardData } from "@shared/types";
import { AppCard } from "./app-card";

const base: AppCardData = {
  slug: "wavelength",
  url: "https://wavelength.lgtm.page/",
  host: "wavelength.lgtm.page",
  title: "Wavelength",
  description: "Read your friends' minds.",
  image: "https://wavelength.lgtm.page/og.png",
  imageAlt: "The board",
  icon: "https://wavelength.lgtm.page/favicon.svg",
  repo: "https://github.com/patsissons/wavelength",
  status: "ok",
};

describe("AppCard", () => {
  it("shows the Open Graph image, title, description and links", () => {
    render(<AppCard app={base} />);
    expect(screen.getByRole("img", { name: "The board" })).toHaveAttribute(
      "src",
      base.image,
    );
    expect(screen.getByRole("link", { name: "Wavelength" })).toHaveAttribute(
      "href",
      base.url,
    );
    expect(
      screen.getByRole("link", { name: "Wavelength source code" }),
    ).toHaveAttribute("href", base.repo);
    expect(screen.getByText("Read your friends' minds.")).toBeInTheDocument();
    expect(screen.getByText("wavelength.lgtm.page")).toBeInTheDocument();
    expect(screen.queryByText(/unreachable/)).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when the image fails to load", () => {
    render(<AppCard app={base} />);
    fireEvent.error(screen.getByRole("img", { name: "The board" }));
    expect(
      screen.queryByRole("img", { name: "The board" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("app-card-placeholder")).toHaveTextContent(
      "Wavelength",
    );
  });

  it("uses the placeholder when there is no image and flags unreachable apps", () => {
    render(
      <AppCard
        app={{
          slug: "down",
          url: "https://down.lgtm.page/",
          host: "down.lgtm.page",
          title: "down.lgtm.page",
          status: "error",
        }}
      />,
    );
    expect(screen.getByTestId("app-card-placeholder")).toBeInTheDocument();
    expect(screen.getByText(/unreachable/)).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /source code/ }),
    ).not.toBeInTheDocument();
  });
});
