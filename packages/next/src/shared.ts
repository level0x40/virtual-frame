/**
 * Shared server-side utilities used by both the React Server Component
 * entry (`index.server.tsx`) and the client entry (`client.tsx`).
 *
 * This module intentionally has NO `"use client"` or `"use server"`
 * directive so it can be imported from either environment.
 *
 * IMPORTANT: In Next.js App Router the RSC layer and the client SSR
 * layer maintain separate module graphs (even though they run in the
 * same Node.js process).  A plain module-level `Map` would create two
 * isolated instances — one per layer — so the HTML written by
 * `prepareVirtualFrameProps()` (RSC) would be invisible to the client
 * `VirtualFrame` component during its SSR pass.
 *
 * We solve this by anchoring the cache and counter on `globalThis`,
 * which is shared across all module graphs in the same process.
 */

// ── SSR HTML cache ──────────────────────────────────────────
// Populated by `prepareVirtualFrameProps()` during the RSC render.
// Read by the client-side `VirtualFrame` during its SSR pass, then
// consumed (deleted).
//
// On the browser this Map is always empty — the server-rendered content
// is already in the DOM and preserved via `suppressHydrationWarning`.

const CACHE_KEY = "__vfSsrHtmlCache__";
const COUNTER_KEY = "__vfSsrIdCounter__";

declare global {
  // eslint-disable-next-line no-var
  var __vfSsrHtmlCache__: Map<string, string> | undefined;
  // eslint-disable-next-line no-var
  var __vfSsrIdCounter__: number | undefined;
}

export const _ssrHtmlCache: Map<string, string> =
  globalThis[CACHE_KEY] ?? (globalThis[CACHE_KEY] = new Map<string, string>());

/** @internal Generate a unique SSR cache key. */
export function _nextSsrId(): string {
  const next = (globalThis[COUNTER_KEY] ?? 0) + 1;
  globalThis[COUNTER_KEY] = next;
  return String(next);
}
