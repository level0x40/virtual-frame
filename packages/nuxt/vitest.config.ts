import { resolve } from "node:path";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@virtual-frame/store": resolve(__dirname, "../store/src/index.ts"),
      "@virtual-frame/vue": resolve(__dirname, "../vue/src/index.ts"),
    },
  },
  test: {
    name: "nuxt",
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }], headless: true,
    },
    include: ["test/**/*.test.ts"],
  },
});
