import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";

/**
 * Injects CORS headers into every dev-server response.
 *
 * `server.headers` only applies to static files served by Vite's own
 * handler.  Responses produced by plugins (e.g. TanStack Start's
 * `@tanstack-start/styles.css` virtual module) bypass that.  A
 * `configureServer` middleware that runs before everything else ensures
 * every response gets the headers.
 */
function corsPlugin(): Plugin {
  return {
    name: "vf-cors",
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "*");
        res.setHeader("X-Frame-Options", "ALLOWALL");
        next();
      });
    },
  };
}

const port = Number(process.env.PORT) || 3005;

export default defineConfig(({ command }) => ({
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  preview: { host: "127.0.0.1", port, strictPort: true },
  plugins: [
    corsPlugin(),
    tanstackStart(),
    react(),
    // Nitro only during build — in dev it causes stale SSR HTML after HMR
    // updates, leading to hydration mismatches (TanStack Router #6556).
    command === "build" &&
      nitro({
        routeRules: {
          "/**": {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "X-Frame-Options": "ALLOWALL",
            },
          },
        },
      }),
  ],
}));
