const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3009";

export default defineNuxtConfig({
  devtools: { enabled: false },

  // Port/host read from PORT/HOST env (Nuxt honours them automatically) so
  // e2e can allocate a free port per run. Do not hardcode here.

  compatibilityDate: "2025-01-01",

  // Vite HMR defaults to a fixed port (24678). When this example runs in
  // parallel with other Vite-based examples (e2e runner), that
  // port collides:  "WebSocket server error: Port 24678 is already in use".
  // `port: 0` lets the OS pick a free port per dev server.
  vite: {
    server: {
      // Derive HMR port from PORT env so parallel dev servers never
      // collide on the default 24678. Falls back to 24678 for solo runs.
      hmr: {
        port: process.env.PORT ? Number(process.env.PORT) + 10000 : 24678,
      },
    },
  },

  nitro: {
    devProxy: {
      "/__vf": {
        target: REMOTE_URL,
        changeOrigin: true,
      },
    },
  },
});
