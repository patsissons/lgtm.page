import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the site name", () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { level: 1, name: "lgtm.page" }),
    ).toBeInTheDocument();
  });

  // A second render proves cleanup runs between tests (one heading, not two).
  it("renders a single heading per test", () => {
    render(<App />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
