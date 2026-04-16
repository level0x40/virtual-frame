/**
 * @virtual-frame/react-server — Default (client) entry.
 *
 * Resolved when the `"react-server"` condition does NOT match (i.e. in
 * Client Components or any non-RSC context).
 *
 * Re-exports both client components and server-side helpers so the TS
 * language server (which doesn't resolve `"react-server"` conditions)
 * can see the full public API.  The server-only imports are safe here
 * because `virtual-frame/ssr` uses a lazy dynamic import for
 * `node-html-parser` and never loads it in the browser.
 */

// Client VirtualFrame component ("use client" is on client.tsx)
export { VirtualFrame, VirtualFrameStoreProvider } from "./client";
export type { VirtualFrameProps } from "./client";

// Server helpers — safe to import here because `virtual-frame/ssr` uses
// lazy dynamic imports for Node-only deps and never loads them in the browser.
export { fetchVirtualFrame, renderVirtualFrame } from "virtual-frame/ssr";
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

// NOTE: only type-only re-exports from "./cache" — `cache.ts` is server-only
// (uses `"use cache"` and Node-side helpers) and must NOT be evaluated in the
// browser.  The runtime functions live on the `"react-server"` condition entry
// (`index.server.tsx`).  Re-exporting values here would pull cache.ts into the
// client graph and crash with "Unexpected token 'export'" when the raw TS is
// served to the browser.
export type { PrepareVirtualFramePropsOptions, VfSsrData } from "./cache";

// Unified useStore hook ("use client" is on store.ts)
export { useStore } from "./store";
