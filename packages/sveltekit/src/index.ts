/**
 * @virtual-frame/sveltekit — Client-safe entry.
 *
 * Exports the SSR-aware `<VirtualFrame>` component and re-exports the
 * reactive `useStore` helper from `@virtual-frame/svelte`.  Does NOT
 * import `virtual-frame/ssr` or any Node-only modules — safe to include
 * in the client bundle.
 *
 * For server-only helpers (`fetchVirtualFrame`, `prepareVirtualFrameProps`),
 * import from `@virtual-frame/sveltekit/server` inside a `+page.server.ts`.
 */

export { default as VirtualFrame } from "./VirtualFrameSSR.svelte";

// Re-export the reactive store helper from @virtual-frame/svelte
export { useStore, createVirtualFrame } from "@virtual-frame/svelte";
export type { VirtualFrameRef, CreateVirtualFrameOptions } from "@virtual-frame/svelte";

// Type-only re-exports so consumers can reference these without
// pulling the server module into the client bundle at runtime.
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

export type { PrepareVirtualFramePropsOptions } from "./server";
