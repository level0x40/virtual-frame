import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Port is read from the `PORT` env var so the e2e harness can allocate
// free ports dynamically and run specs in parallel. Falls back to the
// original 5176 for manual `pnpm dev` / `pnpm start` invocations.
const port = Number(process.env.PORT) || 5176;

export default defineConfig({
  plugins: [vue()],
  publicDir: "../shared",
  // Bind 127.0.0.1 explicitly: Vite 8 on macOS resolves `localhost` to `::1`,
  // which confuses Playwright / curl / net probes that stick to IPv4.
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
