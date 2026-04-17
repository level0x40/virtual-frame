"use client";

import { useRef, useEffect, useImperativeHandle } from "react";
import { VirtualFrame as VirtualFrameCore, _buildEnvShim } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";

// Re-export shared server-side utilities so existing Pages Router
// imports (`from "@virtual-frame/next"` → client.tsx) keep working.
import { _ssrHtmlCache, _nextSsrId } from "./shared";
export { _ssrHtmlCache, _nextSsrId };

// ── Shared iframe registry ──────────────────────────────────
// Multiple instances pointing to the same `src` share a single hidden
// iframe (ref-counted).  The first instance to mount creates the iframe
// (seeded with srcdoc from the SSR delta); subsequent instances just
// bump the refCount.  The iframe is removed only when the last consumer
// unmounts.
const _sharedIframes: Map<
  string,
  { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
> = new Map();

// ── Resume delta shape ──────────────────────────────────────

interface VirtualFrameResumeDelta {
  u: string;
  h: string;
  a: string;
  r: string;
  d: string[];
}

// ── VirtualFrameActivator (internal) ────────────────────────
// The actual client-side activator that reads the SSR resume delta from
// the DOM, creates the shared srcdoc iframe, and starts VirtualFrame
// core for live mirroring.  Used by both the client-side `VirtualFrame`
// and the server-side `VirtualFrame` (imported as a client reference).

export interface VirtualFrameActivatorProps {
  /** Remote URL (used as the shared-iframe registry key). */
  src: string;
  /** Shadow DOM isolation mode. */
  isolate?: "open" | "closed";
  /** CSS selector to project only a matching subtree. */
  selector?: string;
  /** FPS for canvas/video streaming. */
  streamingFps?: number | Record<string, number>;
  /** React 19 ref — exposes `{ refresh() }`. */
  ref?: React.Ref<{ refresh(): void }>;
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided, a `MessageChannel` is created and one port is sent to
   * the hidden iframe so both sides can synchronise store state in real
   * time.  The bridge is established once per shared iframe; all
   * instances pointing to the same `src` share it.
   */
  store?: StoreProxy;
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
 * Client activator for a server-rendered virtual frame.
 *
 * Reads the SSR HTML and resume delta directly from the DOM — no large
 * props needed.  Must be rendered immediately after a `[data-vf-host]`
 * element.
 *
 * On mount it reconstructs a same-origin srcdoc iframe from the
 * embedded resume delta (no extra network request) and initialises the
 * `VirtualFrame` core class for live mirroring.  Multiple instances
 * sharing the same `src` share a single iframe (ref-counted).
 */
export function VirtualFrameActivator({
  src,
  isolate,
  selector,
  streamingFps,
  ref,
  store,
  proxy,
}: VirtualFrameActivatorProps) {
  const markerRef = useRef<HTMLSpanElement>(null);
  const mirrorRef = useRef<InstanceType<typeof VirtualFrameCore> | null>(null);
  const sharedKeyRef = useRef<string | null>(null);

  // Cast to `any` to avoid type mismatch when the consumer's @types/react
  // resolves to a different copy than this package (common in monorepos).
  useImperativeHandle(ref as any, () => ({
    refresh() {
      mirrorRef.current?.refresh();
    },
  }));

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    // Find the host element — rendered immediately before this marker
    // inside the [data-vf-wrapper] parent.
    const host = marker.previousElementSibling as HTMLElement | null;
    if (!host || !host.hasAttribute("data-vf-host")) return;

    // Read the resume delta from the embedded script tag.
    const root = host.shadowRoot || host;
    const resumeEl = root.querySelector('script[type="text/vf-resume"]');
    if (!resumeEl) return;

    let delta: VirtualFrameResumeDelta;
    try {
      delta = JSON.parse(resumeEl.textContent || "{}");
    } catch {
      return;
    }
    resumeEl.remove(); // clean up — no longer needed

    // ── Shared iframe setup ─────────────────────────────────
    let iframe: HTMLIFrameElement;
    let shared = _sharedIframes.get(src);

    if (shared) {
      iframe = shared.iframe;
      shared.refCount++;
    } else {
      iframe = document.createElement("iframe");

      const baseUrl = delta.u || src;
      const baseTag = `<base href="${baseUrl}">`;
      const bodyAttrs = delta.a ? " " + delta.a : "";
      // The diff carries relative URLs matching the remote origin —
      // the <base href> tag in the iframe handles resolution.
      const body = delta.d.join("");

      // Env shim: runs before any framework code.
      //
      // Uses document.write (not srcdoc) so that window.location is
      // the host's real URL — we then use history.replaceState to set
      // the pathname to match the remote page.  This makes
      // usePathname(), next/link, and other location-dependent APIs
      // work correctly inside the iframe.
      const envShim = _buildEnvShim(baseUrl, { proxyBase: proxy });

      const htmlAttrs = delta.r ? " " + delta.r : "";

      const htmlContent =
        `<!DOCTYPE html><html${htmlAttrs}><head>${baseTag}${envShim}${delta.h}</head>` +
        `<body${bodyAttrs}>${body}</body></html>`;

      iframe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");

      // Insert iframe first so contentDocument is accessible, then
      // inject content via document.write.  This makes the iframe
      // same-origin with the host so history.replaceState can set
      // the correct pathname (unlike srcdoc where window.location
      // is "about:srcdoc" and cannot be overridden).
      host.parentNode!.insertBefore(iframe, host);
      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(src, shared);
    }

    // ── Store bridge ────────────────────────────────────────
    if (store && !shared.storeCleanup) {
      import("@virtual-frame/store").then(({ connectPort }) => {
        const s = _sharedIframes.get(src);
        if (!s || s.storeCleanup) return;

        let portCleanup: (() => void) | undefined;

        const connect = () => {
          if (portCleanup) return;
          if (!s.iframe.contentWindow) return;
          const channel = new MessageChannel();
          s.iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
          portCleanup = connectPort(store, channel.port1);
        };

        const onMessage = (e: MessageEvent) => {
          if (e.source === s.iframe.contentWindow && e.data?.type === "vf-store:ready") {
            connect();
          }
        };

        window.addEventListener("message", onMessage);

        s.storeCleanup = () => {
          window.removeEventListener("message", onMessage);
          portCleanup?.();
        };
      });
    }

    sharedKeyRef.current = src;
    mirrorRef.current = new VirtualFrameCore(iframe, host, {
      isolate,
      selector,
      streamingFps,
    });

    return () => {
      mirrorRef.current?.destroy();
      mirrorRef.current = null;

      if (sharedKeyRef.current) {
        const s = _sharedIframes.get(sharedKeyRef.current);
        if (s) {
          s.refCount--;
          if (s.refCount <= 0) {
            s.storeCleanup?.();
            s.iframe.remove();
            _sharedIframes.delete(sharedKeyRef.current);
          }
        }
        sharedKeyRef.current = null;
      }
    };
  }, [src, isolate, selector, streamingFps, store, proxy]);

  return <span ref={markerRef} data-vf-init="" style={{ display: "none" }} />;
}

// ── VirtualFrame (client-side) ──────────────────────────────
// Isomorphic component for Pages Router and "use client" files.
// Renders the SSR host element + the activator in the expected DOM
// structure.  In App Router, the server-side `VirtualFrame` (from
// index.server.tsx) is used instead — resolved via the "react-server"
// conditional export.

export interface VirtualFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remote URL. */
  src: string;
  /** Shadow DOM isolation mode. */
  isolate?: "open" | "closed";
  /** CSS selector to project only a matching subtree. */
  selector?: string;
  /** FPS for canvas/video streaming. */
  streamingFps?: number | Record<string, number>;
  /** Ref — exposes `{ refresh() }`. */
  ref?: React.Ref<{ refresh(): void }>;
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided, the store bridge is established automatically once
   * the hidden iframe is ready.
   */
  store?: StoreProxy;
  /**
   * Same-origin proxy prefix for fetch/XHR requests.
   *
   * When set, the env shim rewrites host-origin fetch/XHR requests to
   * `location.origin + proxy + pathname` instead of the remote origin,
   * avoiding CORS.  The host server must have a rewrite rule that
   * proxies `proxy/:path*` → `remoteOrigin/:path*`.
   */
  proxy?: string;
  /** @internal SSR cache key set by `prepareVirtualFrameProps()`. */
  _vfId?: string;
}

/**
 * Client-side Virtual Frame component.
 *
 * Renders the host element and the activator together.  For Pages
 * Router, pair with `prepareVirtualFrameProps()` in
 * `getServerSideProps` to get SSR content.  For App Router Server
 * Components, the `"react-server"` conditional export resolves to the
 * async server version automatically.
 *
 * ```tsx
 * // Pages Router:
 * <VirtualFrame {...await prepareVirtualFrameProps(frame)} store={myStore} />
 *
 * // Client component:
 * <VirtualFrame src="/remote/" store={myStore} />
 * ```
 */
export function VirtualFrame({
  src,
  isolate,
  selector,
  streamingFps,
  ref,
  _vfId,
  store,
  proxy,
  // React RSC internals (e.g. _debugChunk) leak through when this component
  // is rendered from a Server Component.  Strip any underscore-prefixed props
  // so they never reach the DOM element.
  ...restProps
}: VirtualFrameProps) {
  const props = Object.fromEntries(Object.entries(restProps).filter(([k]) => !k.startsWith("_")));
  // Server: read SSR HTML from cache (populated by prepareVirtualFrameProps).
  // Client: cache is empty → renders '' → server-rendered DOM preserved
  //         by suppressHydrationWarning.
  let html = "";
  if (typeof window === "undefined" && _vfId) {
    html = _ssrHtmlCache.get(_vfId) || "";
    _ssrHtmlCache.delete(_vfId);
  }

  return (
    <div data-vf-wrapper="" style={{ display: "contents" }}>
      <div
        data-vf-host=""
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: html }}
        {...props}
      />
      <VirtualFrameActivator
        src={src}
        isolate={isolate}
        selector={selector}
        streamingFps={streamingFps}
        ref={ref}
        store={store}
        proxy={proxy}
      />
    </div>
  );
}
