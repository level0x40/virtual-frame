import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  ssr: true,
  vite: {
    ssr: {
      noExternal: [
        "@solidjs/router",
        "@virtual-frame/solid",
        "@virtual-frame/solid-start",
      ],
      resolve: {
        conditions: ["solid", "node", "import", "module", "default"],
      },
    },
    resolve: {
      conditions: ["solid", "browser", "import", "module", "default"],
    },
  },
  server: {
    compatibilityDate: "2026-04-08",
    routeRules: {
      "/**": {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "X-Frame-Options": "ALLOWALL",
        },
      },
    },
  },
});
