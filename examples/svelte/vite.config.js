import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const port = Number(process.env.PORT) || 5177;

export default defineConfig({
  plugins: [svelte()],
  publicDir: "../shared",
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
