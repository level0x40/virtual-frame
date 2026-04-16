/**
 * @virtual-frame/sveltekit/server — Server-only entry.
 *
 * Contains SSR helpers that depend on `node-html-parser` and must NOT
 * be bundled into the client.  Import from this subpath inside
 * SvelteKit `+page.server.ts` or `+server.ts` files.
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
 * Call this inside a SvelteKit `+page.server.ts` load function and
 * return the result — SvelteKit will serialise it into the page's
 * `data` and the client component will resume live mirroring.
 *
 * ```ts
 * // src/routes/+page.server.ts
 * import {
 *   fetchVirtualFrame,
 *   prepareVirtualFrameProps,
 * } from "@virtual-frame/sveltekit/server";
 *
 * export const load = async () => {
 *   const frame = await fetchVirtualFrame("http://remote:3013");
 *   return {
 *     frame: await prepareVirtualFrameProps(frame),
 *   };
 * };
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
