import { defineConfig } from "@solidjs/start/config";

const REMOTE_URL = process.env.REMOTE_URL ?? "http://localhost:3015";

export default defineConfig({
  ssr: true,
  vite: {
    ssr: {
      noExternal: ["@solidjs/router", "@virtual-frame/solid", "@virtual-frame/solid-start"],
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
    devProxy: {
      "/__vf": {
        target: REMOTE_URL,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/__vf/, ""),
      },
    },
  },
});
