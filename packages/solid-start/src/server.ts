/**
 * @virtual-frame/solid-start/server — Server-only entry.
 *
 * Contains SSR helpers that depend on `node-html-parser` and must NOT
 * be bundled into the client. Import from this subpath inside a
 * SolidStart server function or a route query marked with `"use server"`.
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
   * Same-origin proxy prefix for fetch/XHR requests issued by the
   * remote app. Passed through to the client component's `proxy` prop.
   */
  proxy?: string;
}

/**
 * Prepare serialisable props for `<VirtualFrame>` from a pre-fetched
 * SSR result.
 *
 * Returns the SSR HTML (wrapped in declarative shadow DOM for seamless
 * handoff) plus the `src` URL. The client uses `iframe.src` with the
 * cross-origin bridge protocol — no `document.write` iframes.
 *
 * Call this inside a SolidStart route query marked `"use server"` and
 * return the result. The route component receives the props via
 * `createAsync()`.
 *
 * ```ts
 * // src/routes/index.tsx
 * import { query, createAsync } from "@solidjs/router";
 * import {
 *   fetchVirtualFrame,
 *   prepareVirtualFrameProps,
 * } from "@virtual-frame/solid-start/server";
 *
 * const getFrame = query(async () => {
 *   "use server";
 *   const frame = await fetchVirtualFrame("http://localhost:3015");
 *   return {
 *     frame: await prepareVirtualFrameProps(frame),
 *   };
 * }, "frame");
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
