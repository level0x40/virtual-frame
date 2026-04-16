import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@virtual-frame/store": resolve(__dirname, "../store/src/index.ts"),
    },
  },
  test: {
    name: "svelte",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }], headless: true,
    },
    include: ["test/**/*.test.ts"],
  },
});
