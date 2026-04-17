/**
 * @virtual-frame/solid-start — Client-safe entry.
 *
 * Exports the SSR-aware `<VirtualFrame>` component and re-exports the
 * reactive `useStore` primitive from `@virtual-frame/solid`. Does NOT
 * import `virtual-frame/ssr` or any Node-only modules — safe to
 * include in the client bundle.
 *
 * For server-only helpers (`fetchVirtualFrame`, `prepareVirtualFrameProps`),
 * import from `@virtual-frame/solid-start/server` inside a route query
 * marked with `"use server"`.
 */

export { VirtualFrame } from "./VirtualFrameSSR";
export type { VirtualFrameSSRProps } from "./VirtualFrameSSR";

// Re-export reactive primitives from @virtual-frame/solid.
export { useStore, createVirtualFrame } from "@virtual-frame/solid";
export type { VirtualFrameRef, CreateVirtualFrameOptions } from "@virtual-frame/solid";

// Type-only re-exports so consumers can reference SSR types without
// pulling the server module into the client bundle at runtime.
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

export type { PrepareVirtualFramePropsOptions } from "./server";
