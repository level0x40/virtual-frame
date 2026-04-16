import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Injects CORS headers into every dev-server response.
 *
 * `server.headers` only applies to static files served by Vite's own
 * handler.  Responses produced by plugins bypass that.  A
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

const port = Number(process.env.PORT) || 3007;

export default defineConfig({
  server: { host: "127.0.0.1", port, strictPort: true, hmr: !process.env.CI },
  plugins: [corsPlugin(), reactRouter()],
});
