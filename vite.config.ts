/// <reference types="vitest/config" />
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  // The cloudflare plugin boots workerd, which unit tests don't need.
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.VITEST ? [] : [cloudflare()]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "worker/**/*.{test,spec}.ts",
      "shared/**/*.{test,spec}.ts",
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
});
