import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const port = Number(process.env.PORT) || 5176;

export default defineConfig({
  plugins: [react()],
  base: "/remote/",
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    hmr: !process.env.CI,
    allowedHosts: true,
  },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
