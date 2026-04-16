import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      provider: "istanbul",
      include: ["packages/*/src/**/*.{ts,tsx,vue,svelte}"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
