import { useRef, useState, useEffect, useImperativeHandle } from "react";
import { VirtualFrame as VirtualFrameCore } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";

// ── Shared iframe registry ──────────────────────────────────
// Multiple VirtualFrame instances pointing to the same `src` share a
// single hidden iframe (ref-counted).  The first instance to mount
// creates the iframe; subsequent instances just bump the refCount.
// The iframe is removed only when the last consumer unmounts.
const _sharedIframes: Map<
  string,
  { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
> = new Map();

// ── VirtualFrame (public) ────────────────────────────────────

export interface VirtualFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  src: string;
  isolate?: "open" | "closed";
  selector?: string;
  streamingFps?: number | Record<string, number>;
  ref?: React.Ref<{ refresh(): void }>;
  store?: StoreProxy;
  proxy?: string;
  /** @internal SSR HTML from `prepareVirtualFrameProps()`. */
  _vfHtml?: string;
}

/**
 * Virtual Frame component for TanStack Start.
 *
 * Shows server-fetched SSR content immediately via `dangerouslySetInnerHTML`
 * (wrapped in declarative shadow DOM, which the browser's HTML parser
 * processes on initial page load).
 *
 * On mount, creates a hidden iframe with `iframe.src` pointing to the
 * remote URL.  VirtualFrameCore auto-detects the cross-origin iframe and
 * uses the bridge protocol (`virtual-frame/bridge`) for live mirroring.
 * The bridge script must be included in the remote TanStack Start app.
 *
 * VirtualFrameCore takes over the existing shadow root (created by the
 * declarative shadow DOM SSR) seamlessly — no flash of content.
 *
 * For client-side navigations (where the browser's HTML parser doesn't
 * process declarative shadow DOM in innerHTML), we use `setHTMLUnsafe()`
 * to parse the shadow DOM template correctly.
 */
export function VirtualFrame({
  src,
  isolate,
  selector,
  streamingFps,
  ref: externalRef,
  _vfHtml,
  store,
  proxy: _proxy,
  ...restProps
}: VirtualFrameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<InstanceType<typeof VirtualFrameCore> | null>(null);
  const sharedKeyRef = useRef<string | null>(null);

  // After mount, stop rendering the SSR HTML via dangerouslySetInnerHTML.
  // The shadow root already exists (from the browser's HTML parser on
  // initial page load, or from setHTMLUnsafe on client-side navigation)
  // and VirtualFrameCore owns it.  Re-rendering the <template shadowrootmode>
  // markup via innerHTML triggers the browser warning and would clobber the
  // live shadow root content.
  const [mounted, setMounted] = useState(false);

  const props = Object.fromEntries(
    Object.entries(restProps).filter(([k]) => !k.startsWith("_"))
  );

  const html = _vfHtml || "";

  useImperativeHandle(externalRef, () => ({
    refresh() {
      mirrorRef.current?.refresh();
    },
  }));

  // On client-side navigation, the browser's HTML parser doesn't process
  // <template shadowrootmode> in innerHTML (which React's
  // dangerouslySetInnerHTML uses).  Use setHTMLUnsafe() to parse it.
  // Also marks the component as mounted so subsequent re-renders don't
  // touch innerHTML.
  useEffect(() => {
    const host = hostRef.current;

    if (host && html && !host.shadowRoot) {
      // Check if there's an unprocessed <template shadowrootmode> in the
      // light DOM — this means innerHTML was used (client-side navigation).
      const template = host.querySelector(
        "template[shadowrootmode]"
      ) as HTMLTemplateElement | null;
      if (template && typeof (host as any).setHTMLUnsafe === "function") {
        (host as any).setHTMLUnsafe(html);
      }
    }

    setMounted(true);
  }, [html]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // ── Shared iframe setup (cross-origin via iframe.src) ──────
    let iframe: HTMLIFrameElement;
    let shared = _sharedIframes.get(src);

    if (shared) {
      iframe = shared.iframe;
      shared.refCount++;
    } else {
      iframe = document.createElement("iframe");
      iframe.src = src;

      iframe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");

      // Insert the iframe into the DOM.  The remote TanStack Start app
      // loads at its own origin, hydrates correctly (no document.write
      // breaking Seroval's streaming protocol), and the bridge script
      // auto-initialises for cross-origin mirroring.
      host.parentNode!.insertBefore(iframe, host);

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
          s.iframe.contentWindow.postMessage(
            { type: "vf-store:connect" },
            "*",
            [channel.port2],
          );
          portCleanup = connectPort(store, channel.port1);
        };

        const onMessage = (e: MessageEvent) => {
          if (
            e.source === s.iframe.contentWindow &&
            e.data?.type === "vf-store:ready"
          ) {
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

    // VirtualFrameCore auto-detects cross-origin via _isCrossOrigin()
    // (checks iframe.src origin vs location.origin) and uses
    // _initCrossOrigin() → bridge protocol.  It also takes over any
    // existing shadow root on the host (from declarative shadow DOM SSR).
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
  }, [src, isolate, selector, streamingFps, store]);

  return (
    <div
      ref={hostRef}
      data-vf-host=""
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: mounted ? "" : html }}
      {...props}
    />
  );
}
