/**
 * @virtual-frame/react-router — Client-safe entry.
 *
 * Exports the client-side `VirtualFrame` component and the unified
 * `useStore` hook.  Does NOT import `virtual-frame/ssr` or any
 * Node-only modules — safe to include in the client bundle.
 *
 * For server-only helpers (`fetchVirtualFrame`, `prepareVirtualFrameProps`),
 * import from `@virtual-frame/react-router/server` inside a route
 * `loader` function.
 */

// Client VirtualFrame component
export { VirtualFrame } from "./client";
export type { VirtualFrameProps } from "./client";

// Unified useStore hook
export { useStore } from "./store";

// Type-only re-exports so consumers can reference these types without
// pulling in the server module at runtime.
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

export type {
  PrepareVirtualFramePropsOptions,
} from "./server";
