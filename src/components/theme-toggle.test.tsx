import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "@/lib/theme";
import { ThemeToggle } from "./theme-toggle";

const root = document.documentElement;
const originalMatchMedia = window.matchMedia;

/** A system colour scheme the test can flip, with change listeners. */
function mockSystem(dark: boolean) {
  const listeners = new Set<() => void>();
  const state = { dark };
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return state.dark;
      },
      media: query,
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }) as unknown as MediaQueryList;
  return (next: boolean) => {
    state.dark = next;
    act(() => listeners.forEach((fn) => fn()));
  };
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    root.className = "";
    document.head.innerHTML = '<meta name="theme-color" content="" />';
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("follows a light system theme by default", () => {
    render(<ThemeToggle />);
    expect(root).not.toHaveClass("dark");
    expect(root.style.colorScheme).toBe("light");
    expect(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    ).toBeInTheDocument();
  });

  it("follows a dark system theme by default", () => {
    mockSystem(true);
    render(<ThemeToggle />);
    expect(root).toHaveClass("dark");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#0d0f17",
    );
  });

  it("toggles the theme and remembers the choice", async () => {
    render(<ThemeToggle />);
    await userEvent.click(
      screen.getByRole("button", { name: "Switch to dark mode" }),
    );
    expect(root).toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    await userEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    expect(root).not.toHaveClass("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      "content",
      "#f9f9fb",
    );
  });

  it("prefers a stored choice over the system theme", () => {
    mockSystem(true);
    localStorage.setItem(THEME_KEY, "light");
    render(<ThemeToggle />);
    expect(root).not.toHaveClass("dark");
  });

  it("tracks system changes only until the visitor picks a theme", async () => {
    const setSystem = mockSystem(false);
    render(<ThemeToggle />);
    setSystem(true);
    expect(root).toHaveClass("dark");

    await userEvent.click(
      screen.getByRole("button", { name: "Switch to light mode" }),
    );
    setSystem(true);
    setSystem(false);
    setSystem(true);
    expect(root).not.toHaveClass("dark");
  });
});
