import { defineConfig, type Plugin } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";

// Dual-build via Vite Environment API: a single `vite build` produces both
// the browser build (dist/) and the SSR build (dist/server/), each compiled
// by vite-plugin-solid in the appropriate mode. Consumers select via the
// `node` / `browser` export conditions in package.json.

const entry = {
  index: resolve(import.meta.dirname, "src/index.tsx"),
  store: resolve(import.meta.dirname, "src/store.ts"),
};

const external = [
  "solid-js",
  "solid-js/web",
  "solid-js/store",
  "virtual-frame",
  "@virtual-frame/store",
];

// vite-plugin-solid returns Plugin | Plugin[]; normalize and scope each
// resulting plugin to a single environment so client/ssr get independent
// compilations in the same build run.
function scopedSolid(envName: "client" | "ssr", ssr: boolean): Plugin[] {
  const plugins = ([] as Plugin[]).concat(solid({ ssr }) as Plugin | Plugin[]);
  return plugins.map((p) => ({
    ...p,
    applyToEnvironment: (env) => env.name === envName,
  }));
}

export default defineConfig({
  plugins: [
    ...scopedSolid("client", false),
    ...scopedSolid("ssr", true),
  ],
  environments: {
    client: {
      build: {
        outDir: "dist",
        emptyOutDir: true,
        lib: { entry, formats: ["es"] },
        rollupOptions: { external },
      },
    },
    ssr: {
      build: {
        outDir: "dist/server",
        emptyOutDir: true,
        lib: { entry, formats: ["es"] },
        rollupOptions: { external },
      },
    },
  },
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
    },
  },
});
