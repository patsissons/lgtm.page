import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Testing Library only auto-registers cleanup when test globals exist;
// vitest runs without globals, so unmount between tests explicitly.
afterEach(cleanup);

// The rest is browser-only (worker/shared tests still run under jsdom, but
// guard anyway so the setup never assumes a window).
if (typeof window !== "undefined") {
  // Node ships its own globalThis.localStorage (method-less without
  // --localstorage-file), which shadows jsdom's. Replace it with a working
  // in-memory Storage, emptied between tests.
  const store = new Map<string, string>();
  const storageStub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storageStub,
  });
  afterEach(() => store.clear());

  // jsdom has no matchMedia; default to a light system theme. Tests that
  // need another answer redefine window.matchMedia.
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string): MediaQueryList =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    });
  }
}
