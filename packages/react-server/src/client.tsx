"use client";

import { use, useRef, useEffect, useImperativeHandle, createContext, useContext } from "react";
import { VirtualFrame as VirtualFrameCore, _buildEnvShim } from "virtual-frame";
import { connectPort, type StoreProxy } from "@virtual-frame/store";
import type { VirtualFrameResult } from "virtual-frame/ssr";
import { getVfSsrHtml } from "./cache";

// ── Store context ──────────────────────────────────────────
// Allows a parent client component to provide a store via context
// so it never needs to cross the RSC serialisation boundary.

const VFStoreContext = createContext<StoreProxy | undefined>(undefined);

/**
 * Provides a `@virtual-frame/store` proxy to all descendant
 * `<VirtualFrame>` / `<VirtualFrameActivator>` components via context.
 *
 * Use this in a `"use client"` wrapper around server-rendered
 * `<VirtualFrame>` components so the store never crosses the RSC
 * boundary:
 *
 * ```tsx
 * // page.tsx (Server Component)
 * <StoreProvider store={store}>
 *   <VirtualFrame frame={frame} />
 * </StoreProvider>
 *
 * // StoreProvider.tsx ("use client")
 * import { VirtualFrameStoreProvider } from "@virtual-frame/react-server";
 * import { store } from "../store";
 * export function StoreProvider({ children }) {
 *   return <VirtualFrameStoreProvider store={store}>{children}</VirtualFrameStoreProvider>;
 * }
 * ```
 */
export function VirtualFrameStoreProvider({
  store,
  children,
}: {
  store: StoreProxy;
  children: React.ReactNode;
}) {
  return <VFStoreContext.Provider value={store}>{children}</VFStoreContext.Provider>;
}

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
  store: storeProp,
  proxy,
}: VirtualFrameActivatorProps) {
  const contextStore = useContext(VFStoreContext);
  const store = storeProp ?? contextStore;

  const markerRef = useRef<HTMLSpanElement>(null);
  const mirrorRef = useRef<InstanceType<typeof VirtualFrameCore> | null>(null);
  const sharedKeyRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
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
      // location-dependent APIs work correctly inside the iframe.
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

      // Module scripts (<script type="module">) don't execute when
      // injected via document.write() — this is per the HTML spec.
      // Re-create them as dynamic script elements so the browser
      // actually loads and executes them (needed for Vite HMR,
      // react-server hydration, etc.).
      const moduleScripts = iframeDoc.querySelectorAll('script[type="module"]');
      for (const orig of moduleScripts) {
        const replacement = iframeDoc.createElement("script");
        replacement.type = "module";
        if (orig.hasAttribute("src")) {
          // orig.src is already resolved against the document URL (host origin),
          // but we need it resolved against the remote origin (baseUrl).
          // Use getAttribute() to get the raw relative value, then resolve
          // against baseUrl — <base> tags don't affect dynamically created elements.
          replacement.src = new URL(orig.getAttribute("src")!, baseUrl).href;
        }
        if (orig.textContent) replacement.textContent = orig.textContent;
        if (orig.hasAttribute("async")) replacement.async = true;
        orig.parentNode!.replaceChild(replacement, orig);
      }

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(src, shared);
    }

    // ── Store bridge ────────────────────────────────────────
    if (store && !shared.storeCleanup) {
      let portCleanup: (() => void) | undefined;

      const connect = () => {
        if (portCleanup) return;
        if (!shared.iframe.contentWindow) return;
        const channel = new MessageChannel();
        shared.iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (e.source === shared.iframe.contentWindow && e.data?.type === "vf-store:ready") {
          connect();
        }
      };

      window.addEventListener("message", onMessage);

      shared.storeCleanup = () => {
        window.removeEventListener("message", onMessage);
        portCleanup?.();
      };
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
// Client-only component for "use client" files where the server
// component entry is not available.

export interface VirtualFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Remote URL. */
  src?: string;
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
   */
  proxy?: string;
  /**
   * Pre-fetched SSR result (from `fetchVirtualFrame`).
   *
   * Only used by the Server Component entry — ignored on the client.
   * Present here so TypeScript accepts props when the `"react-server"`
   * conditional export is not resolved for type-checking.
   */
  frame?: VirtualFrameResult;
}

/**
 * Client-side Virtual Frame component.
 *
 * For use in `"use client"` files. In Server Components, the
 * `"react-server"` conditional export resolves to the async server
 * version automatically.
 *
 * During SSR, reads the pre-built HTML from the request-scoped cache
 * (`getVfSsrHtml`) — the same cache populated by the server component.
 * In the browser, the cache is not available (`no-hydrate`) and
 * `suppressHydrationWarning` preserves the server-rendered DOM.
 *
 * To use this pattern, ensure the server component (or a parent)
 * calls `getVfSsrHtml(src, selector, isolate)` before this component
 * renders so the cache is populated.
 */
export function VirtualFrame({
  src,
  isolate = "open",
  selector,
  streamingFps,
  ref,
  store,
  proxy,
  // React RSC internals (e.g. _debugChunk) leak through when this component
  // is rendered from a Server Component.  Strip any underscore-prefixed props
  // so they never reach the DOM element.
  ...restProps
}: VirtualFrameProps) {
  const props = Object.fromEntries(Object.entries(restProps).filter(([k]) => !k.startsWith("_")));
  // During SSR: `use()` resolves the request-scoped cached value
  // synchronously (already computed by the server component or
  // `prepareVirtualFrameProps`).
  // In the browser: the `"use cache: request; no-hydrate"` function
  // is stubbed out by the build system — `suppressHydrationWarning`
  // preserves the server-rendered DOM in place.
  let ssrHtml = "";
  if (typeof window === "undefined" && src) {
    const data = use(getVfSsrHtml(src, selector, isolate));
    ssrHtml = data.ssrHtml;
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
        src={src!}
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
