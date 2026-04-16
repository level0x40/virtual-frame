import { defineConfig } from "vite";

// Port honoured from env so the e2e harness can allocate freely.
// Host is pinned to 127.0.0.1 because Vite 8 on macOS otherwise binds
// only to `::1`, confusing IPv4-only probes.
const port = Number(process.env.PORT) || 5174;

export default defineConfig({
  publicDir: "../shared",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
