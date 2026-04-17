import { onMount, onCleanup, createEffect, createSignal, mergeProps, type JSX } from "solid-js";
import { isServer } from "solid-js/web";
import type { VirtualFrame as VirtualFrameCore, VirtualFrameOptions } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";

// ── Shared iframe registry (module-scoped) ─────────────────────────
// Multiple VirtualFrame instances pointing to the same `src` share a
// single hidden iframe (ref-counted). The first instance to mount
// creates the iframe; subsequent instances just bump the refCount.
// The iframe is removed only when the last consumer unmounts.
const _sharedIframes: Map<
  string,
  { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
> = new Map();

export interface VirtualFrameSSRProps {
  src: string;
  isolate?: VirtualFrameOptions["isolate"];
  selector?: string;
  streamingFps?: VirtualFrameOptions["streamingFps"];
  store?: StoreProxy;
  /**
   * Same-origin proxy prefix for fetch/XHR requests issued by the
   * remote app. Accepted for API parity with other integrations.
   */
  proxy?: string;
  /** @internal SSR HTML from `prepareVirtualFrameProps()`. */
  _vfHtml?: string;
  children?: JSX.Element;
}

/**
 * SolidStart-aware `<VirtualFrame>`.
 *
 * During SSR the server renders `_vfHtml` inline (wrapped in a
 * `<template shadowrootmode>` so the browser creates a real shadow
 * root on first paint). After hydration, the component creates a
 * hidden iframe that points at `src`, attaches `VirtualFrameCore` to
 * it, and takes over the existing shadow root — zero flash, no extra
 * network round-trip.
 */
export function VirtualFrame(rawProps: VirtualFrameSSRProps) {
  const props = mergeProps(
    {
      isolate: undefined as VirtualFrameOptions["isolate"],
      selector: undefined as string | undefined,
      streamingFps: undefined as VirtualFrameOptions["streamingFps"],
      store: undefined as StoreProxy | undefined,
      _vfHtml: undefined as string | undefined,
    },
    rawProps,
  );

  // ── Client path ────────────────────────────────────────
  // Assigned by Solid via `ref={hostEl}` in the JSX below.
  // eslint-disable-next-line no-unassigned-vars
  let hostEl!: HTMLDivElement;
  let core: VirtualFrameCore | null = null;
  let sharedKey: string | null = null;
  const [mounted, setMounted] = createSignal(false);

  async function setup() {
    teardown();
    if (!hostEl || !props.src) return;
    const { VirtualFrame: VirtualFrameCoreCtor } = await import("virtual-frame");

    // On client-side navigation, the browser's HTML parser doesn't
    // process <template shadowrootmode> in innerHTML. Use
    // setHTMLUnsafe() to parse it and create the shadow root.
    if (props._vfHtml && !hostEl.shadowRoot) {
      const template = hostEl.querySelector(
        "template[shadowrootmode]",
      ) as HTMLTemplateElement | null;
      if (template && typeof (hostEl as any).setHTMLUnsafe === "function") {
        (hostEl as any).setHTMLUnsafe(props._vfHtml);
      }
    }

    setMounted(true);

    let iframe: HTMLIFrameElement;
    let shared = _sharedIframes.get(props.src);

    if (shared) {
      iframe = shared.iframe;
      shared.refCount++;
    } else {
      iframe = document.createElement("iframe");
      iframe.src = props.src;
      iframe.style.cssText =
        "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      // iframe is position:fixed + invisible, so attaching to <body>
      // is fine and avoids relying on hostEl being in the DOM yet
      // (setup() is async and hostEl.parentNode may be null in tests
      // or during rapid mount/unmount cycles).
      (hostEl.parentNode ?? document.body).insertBefore(iframe, hostEl.parentNode ? hostEl : null);

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(props.src, shared);
    }

    // ── Store bridge ────────────────────────────────────
    if (props.store && !shared.storeCleanup) {
      const capturedStore = props.store;
      const capturedSrc = props.src;
      import("@virtual-frame/store").then(({ connectPort }) => {
        const s = _sharedIframes.get(capturedSrc);
        if (!s || s.storeCleanup) return;

        let portCleanup: (() => void) | undefined;

        const connect = () => {
          if (portCleanup) return;
          if (!s.iframe.contentWindow) return;
          const channel = new MessageChannel();
          s.iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
          portCleanup = connectPort(capturedStore, channel.port1);
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

    sharedKey = props.src;

    core = new VirtualFrameCoreCtor(iframe, hostEl, {
      isolate: props.isolate,
      selector: props.selector,
      streamingFps: props.streamingFps,
    });
  }

  function teardown() {
    if (core) {
      core.destroy();
      core = null;
    }

    if (sharedKey) {
      const s = _sharedIframes.get(sharedKey);
      if (s) {
        s.refCount--;
        if (s.refCount <= 0) {
          s.storeCleanup?.();
          s.iframe.remove();
          _sharedIframes.delete(sharedKey);
        }
      }
      sharedKey = null;
    }
  }

  if (!isServer) {
    onMount(setup);
    onCleanup(teardown);

    // Re-run setup when reactive props change.
    createEffect(() => {
      const _deps = [props.src, props.isolate, props.selector, props.streamingFps, props.store];
      if (hostEl && mounted()) setup();
    });
  }

  // Single JSX shape for SSR + client so hydration templates match.
  // The outer wrapper is hydrated normally (gives us a stable ref target);
  // <NoHydration> around the inner host div tells Solid to emit its
  // innerHTML on the server but NOT walk/reconcile it during hydration.
  // We point `hostEl` at the inner div so VirtualFrameCore operates on
  // the element that actually hosts the declarative shadow root.
  // Solid's `innerHTML` prop tells the hydrator not to walk children,
  // so the SSR-authored remote markup (including `<template
  // shadowrootmode>`) is preserved as-is and never reconciled.
  return <div ref={hostEl} data-vf-host innerHTML={props._vfHtml ?? ""} />;
}
