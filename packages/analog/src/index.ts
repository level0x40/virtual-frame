/**
 * @virtual-frame/analog — Client-safe entry.
 *
 * Exports the client-side `VirtualFrameComponent` (with SSR HTML support)
 * and the store helpers.  Does NOT import `virtual-frame/ssr` or any
 * Node-only modules — safe to include in the client bundle.
 *
 * For server-only helpers (`fetchVirtualFrame`, `prepareVirtualFrameProps`),
 * import from `@virtual-frame/analog/server` inside a Nitro server route.
 */

// Client VirtualFrame component with SSR HTML support
export { VirtualFrameComponent } from "./client";

// Re-export store helpers from @virtual-frame/angular
export { injectStore, injectStoreValue } from "@virtual-frame/angular/store";

// Type-only re-exports so consumers can reference these types without
// pulling in the server module at runtime.
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

// PrepareVirtualFramePropsOptions is exported from "./server" subpath only —
// importing it here would pull in Node-only deps that break ng-packagr.
