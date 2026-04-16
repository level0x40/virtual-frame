import { defineConfig } from "tsdown";

export default defineConfig([
  // Server entry — async RSC component + re-exports
  {
    entry: {
      "index.server": "src/index.server.tsx",
    },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "react",
        "react/jsx-runtime",
        "virtual-frame",
        "virtual-frame/ssr",
        "@lazarv/react-server",
      ],
    },
  },
  // Default (client) entry — re-exports client component + store + SSR helpers
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "react",
        "react/jsx-runtime",
        "virtual-frame",
        "virtual-frame/ssr",
      ],
    },
  },
  // Cache module — request-scoped SSR HTML cache ("use cache: request")
  {
    entry: { cache: "src/cache.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "virtual-frame/ssr",
      ],
    },
  },
  // Client component — the activator ("use client")
  {
    entry: { client: "src/client.tsx" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["react", "react/jsx-runtime", "virtual-frame", "@virtual-frame/store"],
    },
    banner: { js: '"use client";' },
  },
  // Store hook — remote-side useStore ("use client")
  {
    entry: { store: "src/store.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "react",
        "react/jsx-runtime",
        "@virtual-frame/store",
      ],
    },
    banner: { js: '"use client";' },
  },
]);
