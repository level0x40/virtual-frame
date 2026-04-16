/**
 * @virtual-frame/analog/server — Server-only entry.
 *
 * Contains SSR helpers that depend on `node-html-parser` and must NOT
 * be bundled into the client.  Import from this subpath inside
 * Nitro server routes (Analog API routes).
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
 * Prepare serialisable props for `VirtualFrameComponent` from a pre-fetched
 * SSR result.
 *
 * Returns the SSR HTML (wrapped in declarative shadow DOM for seamless
 * handoff) plus the `src` URL.  The client uses `iframe.src` with the
 * cross-origin bridge protocol — no `document.write` iframes.
 *
 * Call this inside an Analog API route and return the result.
 * The page receives these props via an HTTP fetch or resolver.
 *
 * ```ts
 * // src/server/routes/v1/frame.ts
 * import {
 *   fetchVirtualFrame,
 *   prepareVirtualFrameProps,
 * } from "@virtual-frame/analog/server";
 *
 * export default defineEventHandler(async () => {
 *   const frame = await fetchVirtualFrame("http://remote:3000");
 *   return {
 *     frame: await prepareVirtualFrameProps(frame),
 *   };
 * });
 * ```
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
