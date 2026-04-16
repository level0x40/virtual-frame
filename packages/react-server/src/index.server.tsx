/**
 * @virtual-frame/react-server — React Server Component entry.
 *
 * Resolved via the `"react-server"` conditional export. Provides an
 * async Server Component that fetches a remote page during SSR and
 * renders it as a virtual frame with declarative shadow DOM.
 *
 * SSR HTML is cached per-request via `"use cache: request; no-hydrate"`
 * (see `cache.ts`).  The cached value travels from the RSC layer to
 * the SSR layer automatically — no `httpContext.state` bridge needed —
 * and the `no-hydrate` flag ensures the HTML is NOT duplicated in the
 * flight/hydration payload.
 */

export { fetchVirtualFrame, renderVirtualFrame } from "virtual-frame/ssr";

export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

export { prepareVirtualFrameProps, buildSsrHtml } from "./cache";
export type { PrepareVirtualFramePropsOptions, VfSsrData } from "./cache";

import type { VirtualFrameResult } from "virtual-frame/ssr";
import type { StoreProxy } from "@virtual-frame/store";
import { VirtualFrameActivator, VirtualFrameStoreProvider } from "./client";
import { buildSsrHtml, getVfSsrHtml } from "./cache";

export { VirtualFrameStoreProvider };

// ── Server Component ────────────────────────────────────────

export interface VirtualFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  selector?: string;
  isolate?: "open" | "closed";
  streamingFps?: number | Record<string, number>;
  frame?: VirtualFrameResult;
  ref?: React.Ref<{ refresh(): void }>;
  store?: StoreProxy;
  proxy?: string;
}

/**
 * Async Server Component that fetches a remote page during SSR and
 * renders it as a virtual frame.
 *
 * When `src` is provided, uses the request-scoped cache (`getVfSsrHtml`)
 * so the HTML is computed once and shared with the SSR layer without
 * appearing in the hydration payload.
 *
 * When `frame` is provided (pre-fetched result), builds the HTML
 * directly — the caller is responsible for caching if needed.
 */
export async function VirtualFrame({
  src,
  selector,
  isolate = "open",
  streamingFps,
  frame,
  ref,
  proxy,
  ...restProps
}: VirtualFrameProps) {
  const props = Object.fromEntries(
    Object.entries(restProps).filter(([k]) => !k.startsWith("_"))
  );

  let ssrHtml: string;
  let resolvedSrc: string;

  if (frame) {
    // Pre-fetched result — build HTML directly.
    const result = selector ? await frame.render({ selector }) : frame;
    resolvedSrc = src || result.resumeDelta.u;
    ssrHtml = buildSsrHtml(result, isolate);
  } else if (src) {
    // Use the request-scoped cache — deduplicates across RSC/SSR and
    // keeps the HTML out of the hydration payload.
    const cached = await getVfSsrHtml(src, selector, isolate);
    ssrHtml = cached.ssrHtml;
    resolvedSrc = cached.resolvedSrc;
  } else {
    throw new Error("VirtualFrame: either `src` or `frame` must be provided.");
  }

  return (
    <div data-vf-wrapper="" style={{ display: "contents" }}>
      <div
        data-vf-host=""
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: ssrHtml }}
        {...props}
      />
      <VirtualFrameActivator
        src={resolvedSrc}
        isolate={isolate}
        selector={selector}
        streamingFps={streamingFps}
        ref={ref}
        proxy={proxy}
      />
    </div>
  );
}

/**
 * `useStore` is client-only. Stub that throws at runtime if called in RSC.
 */
export function useStore(): never;
export function useStore<T = unknown>(selector: PropertyKey[]): T;
export function useStore(): never {
  throw new Error(
    "useStore() is a client-only hook. It cannot be called in a Server Component. " +
      'Add "use client" to the file that calls useStore().',
  );
}
