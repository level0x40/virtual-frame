/**
 * @virtual-frame/tanstack-start/server — Server-only entry.
 *
 * Contains SSR helpers that depend on `node-html-parser` and must NOT
 * be bundled into the client.  Import from this subpath inside
 * `createServerFn` handlers or server-only modules.
 */

export { fetchVirtualFrame, renderVirtualFrame } from "virtual-frame/ssr";
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

import type { VirtualFrameResult } from "virtual-frame/ssr";

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
 * Returns the SSR HTML (wrapped in declarative shadow DOM for seamless
 * handoff) plus the `src` URL.  Unlike the Next.js integration, TanStack
 * Start can't use `document.write` iframes (Seroval's streaming protocol
 * breaks), so the client uses `iframe.src` with the cross-origin bridge.
 * No resume delta is needed — the bridge handles DOM serialization.
 *
 * The SSR HTML is serialised as a prop because TanStack Start doesn't
 * have a server-side cache equivalent to Next.js's `_ssrHtmlCache`.
 * Seroval's serialiser escapes `<` as `\x3C`, making this safe.
 */
export async function prepareVirtualFrameProps(
  frame: VirtualFrameResult,
  options?: PrepareVirtualFramePropsOptions,
): Promise<{
  _vfHtml: string;
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}> {
  const { selector, isolate = "open", proxy } = options ?? {};
  const result = selector ? await frame.render({ selector }) : frame;

  // SSR HTML for initial display — wrapped in declarative shadow DOM
  // so VirtualFrameCore can take over the existing shadow root
  // seamlessly (no flash of content when switching to live mirroring).
  // The browser's HTML parser processes <template shadowrootmode> and
  // creates a real shadow root during initial page load.
  // React's dangerouslySetInnerHTML + suppressHydrationWarning skips
  // checking the children so there's no host-side hydration error.
  const ssrHtml = isolate
    ? `<template shadowrootmode="${isolate}">${result.styles}\n${result.body}</template>`
    : `${result.styles}\n${result.body}`;

  const props: {
    _vfHtml: string;
    src: string;
    isolate: "open" | "closed";
    selector?: string;
    proxy?: string;
  } = {
    _vfHtml: ssrHtml,
    src: result.resumeDelta.u,
    isolate,
  };
  if (selector !== undefined) props.selector = selector;
  if (proxy !== undefined) props.proxy = proxy;
  return props;
}
