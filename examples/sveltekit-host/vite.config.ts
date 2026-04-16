import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const port = Number(process.env.PORT) || 3018;
const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://127.0.0.1:3019";

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    hmr: !process.env.CI,
    proxy: {
      "/__vf": {
        target: REMOTE_URL,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/__vf/, ""),
      },
    },
  },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
