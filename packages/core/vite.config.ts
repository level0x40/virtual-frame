import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        element: resolve(import.meta.dirname, "src/element.ts"),
        bridge: resolve(import.meta.dirname, "src/bridge.ts"),
        ssr: resolve(import.meta.dirname, "src/ssr.ts"),
      },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: ["node-html-parser"],
      output: {
        entryFileNames: "[name].js",
      },
    },
  },
});
