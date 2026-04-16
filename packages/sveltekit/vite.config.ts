import { defineConfig } from "vite";
import { resolve } from "node:path";
import { copyFileSync } from "node:fs";

// The `.svelte` component is NOT compiled here — it's shipped as source
// so the consumer's SvelteKit pipeline can compile it for both client
// and server targets. Only the plain `.ts` entries go through vite.
export default defineConfig({
  plugins: [
    {
      name: "copy-svelte-source",
      closeBundle() {
        copyFileSync(
          resolve(import.meta.dirname, "src/VirtualFrameSSR.svelte"),
          resolve(import.meta.dirname, "dist/VirtualFrameSSR.svelte"),
        );
      },
    },
  ],
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
      external: (id) =>
        id === "virtual-frame" ||
        id === "virtual-frame/ssr" ||
        id === "@virtual-frame/store" ||
        id === "@virtual-frame/svelte" ||
        id === "@virtual-frame/svelte/store" ||
        id.endsWith(".svelte") ||
        /^svelte(\/|$)/.test(id) ||
        /^\$app(\/|$)/.test(id),
    },
  },
});
