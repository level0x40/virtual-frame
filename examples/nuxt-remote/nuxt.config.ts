export default defineNuxtConfig({
  devtools: { enabled: false },

  // Do NOT hardcode devServer.port — it overrides the PORT env var and
  // collides when e2e runs dev + prod in parallel. Nuxt reads PORT from
  // env automatically; manual runs default to 3000.
  compatibilityDate: "2025-01-01",

  // Vite HMR defaults to 24678. When running in parallel with the nuxt
  // host (or any other Vite example), that port collides. Derive a
  // per-instance port from PORT so each dev server gets a unique one.
  vite: {
    server: {
      hmr: {
        port: process.env.PORT ? Number(process.env.PORT) + 10000 : 24679,
      },
    },
  },

  modules: ["@nuxt/image", "@nuxt/fonts"],

  image: {
    domains: ["fastly.picsum.photos"],
    providers: {
      ipx: {
        // Absolute baseURL so projected images resolve to the remote's
        // IPX handler even when the HTML is rendered inside the host.
        // Derives from PORT env so it works for both manual runs
        // (PORT=3009) and e2e (dynamic port).
        options: {
          baseURL: `http://localhost:${process.env.PORT || 3009}/_ipx`,
        },
      },
    },
  },

  fonts: {
    families: [
      {
        name: "Fira Code",
        provider: "google",
        weights: [400, 700],
      },
      {
        name: "Playfair Display",
        provider: "google",
        weights: [400, 700],
      },
    ],
  },

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
});
