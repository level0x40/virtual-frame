import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const port = Number(process.env.PORT) || 3019;

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    hmr: !process.env.CI,
    cors: { origin: "*", methods: ["GET", "OPTIONS"] },
    headers: { "X-Frame-Options": "ALLOWALL" },
  },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
