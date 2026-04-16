import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    store: "src/store.ts",
    server: "src/server.ts",
  },
  format: ["esm"],
  dts: true,
  deps: {
    neverBundle: [
      "@angular/core",
      "@angular/common",
      "@angular/platform-browser",
      "virtual-frame",
      "@virtual-frame/store",
      "@virtual-frame/angular",
    ],
  },
});
