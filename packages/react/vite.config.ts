import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.tsx"),
        store: resolve(import.meta.dirname, "src/store.ts"),
      },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        "react",
        "react/jsx-runtime",
        "virtual-frame",
        "@virtual-frame/store",
      ],
    },
  },
  esbuild: {
    jsx: "automatic",
  },
});
