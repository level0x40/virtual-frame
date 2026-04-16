/// <reference types="vite/client" />
import { defineConfig } from "vite";
import analog from "@analogjs/platform";

export default defineConfig({
  plugins: [
    analog({
      ssr: true,
      nitro: {
        routeRules: {
          "/**": {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "*",
              "X-Frame-Options": "ALLOWALL",
            },
          },
        },
      },
    }),
  ],
  server: { host: "127.0.0.1", port: Number(process.env.PORT) || 3011, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port: Number(process.env.PORT) || 3011, strictPort: true },
});
