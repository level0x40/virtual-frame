import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import solid from "vite-plugin-solid";

// Dual-build via Vite Environment API: a single `vite build` produces both
// the browser build (dist/) and the SSR build (dist/server/), each compiled
// by vite-plugin-solid in the appropriate mode. Consumers select via the
// `node` / `browser` export conditions in package.json.

const entry = {
  index: resolve(import.meta.dirname, "src/index.tsx"),
  client: resolve(import.meta.dirname, "src/client.tsx"),
  server: resolve(import.meta.dirname, "src/server.ts"),
  store: resolve(import.meta.dirname, "src/store.ts"),
};

const external = (id: string) =>
  id === "virtual-frame" ||
  id === "virtual-frame/ssr" ||
  id === "@virtual-frame/store" ||
  id === "@virtual-frame/solid" ||
  id === "@virtual-frame/solid/store" ||
  /^solid-js(\/|$)/.test(id) ||
  id.startsWith("@solidjs/");

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
        lib: {
          entry,
          formats: ["es"],
          fileName: (_format, name) => `${name}.js`,
        },
        rollupOptions: { external },
      },
    },
    ssr: {
      build: {
        outDir: "dist/server",
        emptyOutDir: true,
        lib: {
          entry,
          formats: ["es"],
          fileName: (_format, name) => `${name}.js`,
        },
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
