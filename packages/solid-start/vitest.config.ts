import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      "@virtual-frame/store": resolve(__dirname, "../store/src/index.ts"),
      "@virtual-frame/solid": resolve(__dirname, "../solid/src/index.tsx"),
      "@virtual-frame/solid/store": resolve(__dirname, "../solid/src/store.ts"),
    },
  },
  test: {
    name: "solid-start",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
      headless: true,
    },
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
