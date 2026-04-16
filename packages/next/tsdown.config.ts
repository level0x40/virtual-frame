import { defineConfig } from "tsdown";

export default defineConfig([
  // Default (client-safe) entry — re-exports + types.
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["react", "react/jsx-runtime", "next", "virtual-frame"],
    },
    banner: { js: '"use server";' },
  },
  // RSC entry — async Server Component, used when the `react-server`
  // export condition is active (e.g. inside RSC graph compilation).
  {
    entry: { "index.server": "src/index.server.tsx" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "react",
        "react/jsx-runtime",
        "next",
        "virtual-frame",
        "virtual-frame/ssr",
      ],
    },
  },
  // Client entry — the activator component ("use client").
  {
    entry: { client: "src/client.tsx" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["react", "react/jsx-runtime", "next", "virtual-frame", "@virtual-frame/store"],
    },
    banner: { js: '"use client";' },
  },
  // Store hook — useStore React hook ("use client").
  {
    entry: { store: "src/store.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["react", "react/jsx-runtime", "@virtual-frame/store"],
    },
  },
]);
