import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: {
        index: resolve(import.meta.dirname, "src/index.ts"),
        client: resolve(import.meta.dirname, "src/client.ts"),
        server: resolve(import.meta.dirname, "src/server.ts"),
        store: resolve(import.meta.dirname, "src/store.ts"),
      },
      formats: ["es"],
    },
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external: [
        "vue",
        "virtual-frame",
        "virtual-frame/ssr",
        "@virtual-frame/store",
        "@virtual-frame/vue",
      ],
    },
  },
});
