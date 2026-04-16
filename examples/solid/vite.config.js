import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const port = Number(process.env.PORT) || 5178;

export default defineConfig({
  plugins: [solid()],
  publicDir: "../shared",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
