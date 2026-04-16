/**
 * @virtual-frame/nuxt — Client-safe entry.
 *
 * Exports the client-side `VirtualFrame` component (with SSR HTML support)
 * and the `useStore` composable.  Does NOT import `virtual-frame/ssr` or
 * any Node-only modules — safe to include in the client bundle.
 *
 * For server-only helpers (`fetchVirtualFrame`, `prepareVirtualFrameProps`),
 * import from `@virtual-frame/nuxt/server` inside a Nitro server route.
 */

// Client VirtualFrame component with SSR HTML support
export { default as VirtualFrame } from "./VirtualFrameSSR.vue";

// Re-export composables from @virtual-frame/vue
export { useStore, useVirtualFrame } from "@virtual-frame/vue";
export type { VirtualFrameRef, UseVirtualFrameOptions } from "@virtual-frame/vue";

// Type-only re-exports so consumers can reference these types without
// pulling in the server module at runtime.
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

export type { PrepareVirtualFramePropsOptions } from "./server";
