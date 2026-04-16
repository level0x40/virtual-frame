import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [svelte()],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        store: resolve(import.meta.dirname, "src/store.ts"),
      },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: (id) =>
        id === "virtual-frame" ||
        id === "@virtual-frame/store" ||
        /^svelte(\/|$)/.test(id),
    },
  },
});
