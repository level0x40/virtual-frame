import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT) || 5175;
const remoteUrl = process.env.REMOTE_URL || "http://127.0.0.1:5176";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    hmr: !process.env.CI,
    proxy: {
      // Proxy the remote React app through the host so the hidden iframe
      // is same-origin and VirtualFrame can access its DOM.
      "/remote": {
        target: remoteUrl,
        ws: true,
      },
    },
  },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
