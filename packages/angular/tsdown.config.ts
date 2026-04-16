import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    store: "src/store.ts",
  },
  format: ["esm"],
  dts: true,
  deps: {
    neverBundle: ["@angular/core", "virtual-frame", "@virtual-frame/store"],
  },
});
