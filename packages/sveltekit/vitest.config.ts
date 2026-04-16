import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "@virtual-frame/store": resolve(__dirname, "../store/src/index.ts"),
      "@virtual-frame/svelte": resolve(__dirname, "../svelte/src/index.ts"),
      "@virtual-frame/svelte/store": resolve(
        __dirname,
        "../svelte/src/store.ts",
      ),
    },
  },
  test: {
    name: "sveltekit",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }], headless: true,
    },
    include: ["test/**/*.test.ts"],
  },
});
