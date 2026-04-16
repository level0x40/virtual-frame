import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

const port = Number(process.env.PORT) || 3004;

export default defineConfig(({ command }) => ({
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
  plugins: [tanstackStart(), react(), command === "build" && nitro()],
}));
