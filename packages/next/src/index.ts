/**
 * @virtual-frame/next — Default (client) entry.
 *
 * Resolved when the `"react-server"` condition does NOT match (i.e. in
 * Client Components, Pages Router, or any non-RSC context).
 *
 * Exports the client-side `VirtualFrame` component and the unified
 * `useStore` hook.  Also re-exports SSR helpers for Pages Router
 * `getServerSideProps` usage.
 */

// Client VirtualFrame component ("use client" is on client.tsx)
export { VirtualFrame } from "./client";
export type { VirtualFrameProps } from "./client";

// Unified useStore hook ("use client" is on store.ts)
export { useStore } from "./store";

// SSR helpers for Pages Router getServerSideProps
export { fetchVirtualFrame, renderVirtualFrame } from "virtual-frame/ssr";
export type {
  VirtualFrameResult,
  FetchVirtualFrameOptions,
  RenderVirtualFrameOptions,
} from "virtual-frame/ssr";

// prepareVirtualFrameProps lives in index.server.tsx for the RSC path,
// but for the client path we need a local copy that uses the same cache.
export { _ssrHtmlCache, _nextSsrId } from "./client";

// Re-export from server for Pages Router compatibility — the function
// only runs inside getServerSideProps (Node.js), never in the browser.
import type { VirtualFrameResult } from "virtual-frame/ssr";
import { _ssrHtmlCache, _nextSsrId } from "./client";

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

/**
 * Prepare serialisable props for `<VirtualFrame>` from a pre-fetched
 * SSR result.
 *
 * Use this in Pages Router `getServerSideProps`:
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
