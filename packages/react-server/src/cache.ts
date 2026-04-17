/**
 * @virtual-frame/react-server — Request-scoped SSR HTML cache & helpers.
 *
 * Uses `"use cache: request; hydrate=false"` so that:
 *   1. The HTML is computed once per request (RSC and SSR share the result).
 *   2. The large HTML string is NOT embedded in the hydration payload.
 *   3. The rendered DOM is preserved in place via `suppressHydrationWarning`.
 *
 * @module
 */

import { fetchVirtualFrame } from "virtual-frame/ssr";
import type { VirtualFrameResult } from "virtual-frame/ssr";

// ── Types ────────────────────────────────────────────────────

export interface VfSsrData {
  ssrHtml: string;
  resolvedSrc: string;
}

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

// ── HTML builder (pure, non-cached) ─────────────────────────

/**
 * Build the SSR HTML string from a `VirtualFrameResult`.
 */
export function buildSsrHtml(result: VirtualFrameResult, isolate?: "open" | "closed"): string {
  const deltaJson = JSON.stringify(result.resumeDelta).replace(/<\//g, "<\\/");
  const resumeScript = `<script type="text/vf-resume">${deltaJson}</script>`;

  return isolate
    ? `<template shadowrootmode="${isolate}">${result.styles}\n${result.body}${resumeScript}</template>`
    : `${result.styles}\n${result.body}${resumeScript}`;
}

// ── Public API ──────────────────────────────────────────────

/**
 * Prepare props for `<VirtualFrame>` from a pre-fetched SSR result.
 *
 * Follows the same convention as `@virtual-frame/next`'s
 * `prepareVirtualFrameProps`.
 *
 * ```tsx
 * const frame = await fetchVirtualFrame("http://remote:3001");
 * return <VirtualFrame {...await prepareVirtualFrameProps(frame)} />;
 * ```
 */
export async function prepareVirtualFrameProps(
  frame: VirtualFrameResult,
  options?: PrepareVirtualFramePropsOptions,
): Promise<{
  src: string;
  isolate: "open" | "closed";
  selector?: string;
  proxy?: string;
}> {
  const { selector, isolate = "open", proxy } = options ?? {};
  const src = frame.resumeDelta.u;

  // Warm the request-scoped cache so the client VirtualFrame component
  // picks up the pre-built HTML during SSR without a redundant fetch.
  // `getVfSsrHtml` is annotated with `"use cache: request"` — subsequent
  // calls with the same (src, selector, isolate) key return the cached
  // result instantly.
  await getVfSsrHtml(src, selector, isolate);

  const props: {
    src: string;
    isolate: "open" | "closed";
    selector?: string;
    proxy?: string;
  } = { src, isolate };
  if (selector !== undefined) props.selector = selector;
  if (proxy !== undefined) props.proxy = proxy;
  return props;
}

// ── Internal: request-scoped cache ──────────────────────────

/**
 * Fetch a remote page and build the SSR HTML for a virtual frame.
 *
 * Annotated with `"use cache: request; hydrate=false"`:
 * - **request**: the result is cached for the duration of the HTTP request,
 *   so both the RSC server component and the SSR client component get the
 *   same value without re-fetching.
 * - **no-hydrate**: the cached HTML is NOT serialised into the hydration
 *   `<script>` tag, avoiding the duplication problem where the same HTML
 *   would appear both in the rendered DOM and in the flight payload.
 *
 * All three arguments must be provided explicitly (no defaults) so that
 * the cache key is deterministic across RSC and SSR call sites.
 *
 * @internal Used by the VirtualFrame server/client components.
 */
export async function getVfSsrHtml(
  src: string,
  selector: string | undefined,
  isolate: "open" | "closed",
): Promise<VfSsrData> {
  "use cache: request; hydrate=false";

  const frame = await fetchVirtualFrame(src, { selector, isolate });

  return {
    ssrHtml: buildSsrHtml(frame, isolate),
    resolvedSrc: frame.resumeDelta.u,
  };
}
