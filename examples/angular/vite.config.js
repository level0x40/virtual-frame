import { defineConfig } from "vite";
import angular from "@analogjs/vite-plugin-angular";

const port = Number(process.env.PORT) || 5179;

export default defineConfig({
  plugins: [angular()],
  publicDir: "../shared",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
