<script module lang="ts">
  // ── Shared iframe registry (module-scoped) ──────────────────────
  // Multiple VirtualFrame instances pointing to the same `src` share
  // a single hidden iframe (ref-counted).  The first instance to mount
  // creates the iframe; subsequent instances just bump the refCount.
  // The iframe is removed only when the last consumer unmounts.
  const _sharedIframes: Map<
    string,
    { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
  > = new Map();
</script>

<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    VirtualFrame as VirtualFrameCore,
    type VirtualFrameOptions,
  } from "virtual-frame";
  import type { StoreProxy } from "@virtual-frame/store";

  interface Props {
    src: string;
    isolate?: VirtualFrameOptions["isolate"];
    selector?: string;
    streamingFps?: VirtualFrameOptions["streamingFps"];
    store?: StoreProxy;
    proxy?: string;
    /** @internal SSR HTML from `prepareVirtualFrameProps()`. */
    _vfHtml?: string;
  }

  let {
    src,
    isolate,
    selector,
    streamingFps,
    store,
    // biome-ignore lint/correctness/noUnusedVariables: accepted for API parity
    proxy: _proxy,
    _vfHtml,
  }: Props = $props();

  let hostEl: HTMLDivElement | null = $state(null);
  let core: VirtualFrameCore | null = null;
  let sharedKey: string | null = null;
  let mounted = $state(false);

  function setup() {
    teardown();
    if (!hostEl || !src) return;

    // On client-side navigation, the browser's HTML parser doesn't
    // process <template shadowrootmode> in innerHTML.  Use
    // setHTMLUnsafe() to parse it and create the shadow root.
    if (_vfHtml && !hostEl.shadowRoot) {
      const template = hostEl.querySelector(
        "template[shadowrootmode]",
      ) as HTMLTemplateElement | null;
      if (template && typeof (hostEl as any).setHTMLUnsafe === "function") {
        (hostEl as any).setHTMLUnsafe(_vfHtml);
      }
    }

    mounted = true;

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

      hostEl.parentNode!.insertBefore(iframe, hostEl);

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(src, shared);
    }

    // ── Store bridge ────────────────────────────────────────
    if (store && !shared.storeCleanup) {
      const capturedStore = store;
      const capturedSrc = src;
      import("@virtual-frame/store").then(({ connectPort }) => {
        const s = _sharedIframes.get(capturedSrc);
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
          portCleanup = connectPort(capturedStore, channel.port1);
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

    sharedKey = src;

    core = new VirtualFrameCore(iframe, hostEl, {
      isolate,
      selector,
      streamingFps,
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

  export function refresh() {
    if (core) core.refresh();
  }

  onMount(setup);
  onDestroy(teardown);

  // Re-run setup when inputs change (client-only).
  // `$effect` throws during SSR, so guard the call itself.
  if (typeof window !== "undefined") {
    $effect(() => {
      // Track reactivity on each prop that should re-trigger setup.
      const _deps = [src, isolate, selector, streamingFps, store];
      if (hostEl) setup();
    });
  }
</script>

<div bind:this={hostEl} data-vf-host>
  {#if !mounted && _vfHtml}
    {@html _vfHtml}
  {/if}
</div>
