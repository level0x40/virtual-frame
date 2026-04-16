/// <reference types="vite/client" />
import { defineConfig } from "vite";
import analog from "@analogjs/platform";

const port = Number(process.env.PORT) || 3010;
const REMOTE_URL = process.env["REMOTE_URL"] ?? "http://127.0.0.1:3011";

export default defineConfig({
  plugins: [
    analog({
      ssr: true,
      nitro: {
        devProxy: {
          "/__vf": {
            target: REMOTE_URL,
            changeOrigin: true,
          },
        },
      },
    }),
  ],
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
