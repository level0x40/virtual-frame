import { defineConfig } from "tsdown";

export default defineConfig([
  // Default client-safe entry — re-exports + shared types.
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: [
        "react",
        "react/jsx-runtime",
        "@tanstack/react-start",
        "@tanstack/react-router",
        "virtual-frame",
      ],
    },
  },
  // Server-only entry — used inside TanStack Start route loaders.
  {
    entry: { server: "src/server.ts" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["@tanstack/react-start", "@tanstack/react-router", "virtual-frame"],
    },
  },
  // Client entry — VirtualFrame React component ("use client").
  {
    entry: { client: "src/client.tsx" },
    format: ["esm"],
    dts: true,
    deps: {
      neverBundle: ["react", "react/jsx-runtime", "virtual-frame", "@virtual-frame/store"],
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
    banner: { js: '"use client";' },
  },
]);
