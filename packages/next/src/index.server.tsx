/**
 * @virtual-frame/next — React Server Component entry.
 *
 * Resolved via the `"react-server"` conditional export. Provides an
 * async Server Component that fetches a remote page during SSR and
 * renders it as a virtual frame with declarative shadow DOM.
 *
 * The SSR HTML (with the resume delta embedded as a `<script>` tag) is
 * rendered directly by the Server Component — no large props are
 * serialised to the client.
 */

export { fetchVirtualFrame, renderVirtualFrame } from "virtual-frame/ssr";

export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

import { fetchVirtualFrame } from "virtual-frame/ssr";
import type { VirtualFrameResult } from "virtual-frame/ssr";
import { VirtualFrameActivator } from "./client";
import { _ssrHtmlCache, _nextSsrId } from "./shared";

// ── Internal helper ─────────────────────────────────────────

/**
 * Build the SSR HTML string from a render result.
 *
 * Embeds the resume delta as a `<script type="text/vf-resume">` tag
 * inside the content so the client can read it from the DOM — no need
 * to serialise it as a separate prop.
 */
function buildSsrHtml(
  result: VirtualFrameResult,
  isolate?: "open" | "closed",
): string {
  const deltaJson = JSON.stringify(result.resumeDelta).replace(/<\//g, "<\\/");
  const resumeScript = `<script type="text/vf-resume">${deltaJson}</script>`;

  return isolate
    ? `<template shadowrootmode="${isolate}">${result.styles}\n${result.body}${resumeScript}</template>`
    : `${result.styles}\n${result.body}${resumeScript}`;
}

// ── Helpers ─────────────────────────────────────────────────

export interface PrepareVirtualFramePropsOptions {
  /** CSS selector to project only a matching subtree. */
  selector?: string;
  /** Shadow DOM isolation mode. Defaults to `"open"`. */
  isolate?: "open" | "closed";
  /**
   * Same-origin proxy prefix for fetch/XHR requests.
   * Passed through to the client component's `proxy` prop.
   */
  proxy?: string;
}

/**
 * Prepare serialisable props for `<VirtualFrame>` from a pre-fetched
 * SSR result.
 *
 * Use this in Pages Router `getServerSideProps` (or any context where
 * you can't use the async `<VirtualFrame>` Server Component).
 *
 * The SSR HTML is stored in a server-side cache (keyed by a tiny
 * `_vfId` string) and read during the server render — it is **never**
 * included in the serialised props that go into `__NEXT_DATA__`.
 *
 * ```tsx
 * export const getServerSideProps = async () => {
 *   const frame = await fetchVirtualFrame("http://remote:3001");
 *   return { props: { frame: await prepareVirtualFrameProps(frame) } };
 * };
 *
 * export default function Page({ frame }) {
 *   return <VirtualFrame {...frame} />;
 * }
 * ```
 */
export async function prepareVirtualFrameProps(
  frame: VirtualFrameResult,
  options?: PrepareVirtualFramePropsOptions,
): Promise<{
  _vfId: string;
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}> {
  const { selector, isolate = "open", proxy } = options ?? {};
  const result = selector ? await frame.render({ selector }) : frame;

  const _vfId = _nextSsrId();
  _ssrHtmlCache.set(_vfId, buildSsrHtml(result, isolate));

  const props: {
    _vfId: string;
    src: string;
    isolate: "open" | "closed";
    selector?: string;
    proxy?: string;
  } = {
    _vfId,
    src: result.resumeDelta.u,
    isolate,
  };
  if (selector !== undefined) props.selector = selector;
  if (proxy !== undefined) props.proxy = proxy;
  return props;
}

// ── Server Component ────────────────────────────────────────

export interface VirtualFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Remote URL to mirror.
   *
   * Required when `frame` is not provided (triggers an internal fetch).
   * When `frame` is provided, `src` is optional and defaults to the URL
   * stored in the frame's resume delta.
   */
  src?: string;
  /** CSS selector to project only a matching subtree of the remote page. */
  selector?: string;
  /** Shadow DOM isolation mode. Defaults to `"open"`. */
  isolate?: "open" | "closed";
  /** FPS for canvas/video snapshot streaming. */
  streamingFps?: number | Record<string, number>;
  /**
   * Pre-fetched SSR result (from `fetchVirtualFrame`).
   *
   * When provided the component skips the internal fetch and uses this
   * result directly.  Useful when you need to render multiple virtual
   * frames from the same fetch (e.g. full page + a selector projection).
   *
   * If `selector` is also provided, `frame.render({ selector })` is
   * called automatically to produce the projected output.
   */
  frame?: VirtualFrameResult;
  /** React 19 ref — exposes `{ refresh() }`. */
  ref?: React.Ref<{ refresh(): void }>;
  /**
   * Same-origin proxy prefix for fetch/XHR requests.
   *
   * When set, the env shim rewrites host-origin fetch/XHR requests to
   * `location.origin + proxy + pathname` instead of the remote origin,
   * avoiding CORS.  The host server must have a rewrite rule that
   * proxies `proxy/:path*` → `remoteOrigin/:path*`.
   */
  proxy?: string;
}

/**
 * Async Server Component that fetches a remote page during SSR and
 * renders it as a virtual frame.
 *
 * On the server the SSR HTML (styles + body + embedded resume delta) is
 * rendered directly into the page inside a declarative shadow DOM — no
 * large props are serialised to the client.  The companion client
 * activator reads the delta from the DOM on mount and reconstructs a
 * same-origin srcdoc iframe for live mirroring.
 *
 * Usage:
 * ```tsx
 * // Simple — fetches internally:
 * <VirtualFrame src="http://remote:3001" />
 *
 * // With selector:
 * <VirtualFrame src="http://remote:3001" selector="#counter-card" />
 *
 * // Advanced — separate fetch, multiple projections (src is optional):
 * const frame = await fetchVirtualFrame(url);
 * <VirtualFrame frame={frame} />
 * <VirtualFrame frame={frame} selector="#counter-card" />
 * ```
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

  let result: VirtualFrameResult;
  if (frame) {
    result = selector ? await frame.render({ selector }) : frame;
  } else if (src) {
    result = await fetchVirtualFrame(src, { selector, isolate });
  } else {
    throw new Error("VirtualFrame: either `src` or `frame` must be provided.");
  }

  const resolvedSrc = src || result.resumeDelta.u;
  const ssrHtml = buildSsrHtml(result, isolate);

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
 * `useStore` is client-only. This stub provides the same type signature
 * so `import { useStore } from "@virtual-frame/next"` type-checks in
 * shared code, but throws at runtime if accidentally called during SSR.
 */
export function useStore(): never;
export function useStore<T = unknown>(selector: PropertyKey[]): T;
export function useStore(): never {
  throw new Error(
    "useStore() is a client-only hook. It cannot be called in a Server Component. " +
      'Add "use client" to the file that calls useStore().',
  );
}
