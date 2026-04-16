<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { VirtualFrame as VirtualFrameCore, type VirtualFrameOptions } from "virtual-frame";
  import type { StoreProxy } from "@virtual-frame/store";
  import type { VirtualFrameRef } from "./composables.js";

  let { src, frame, isolate, selector, streamingFps, store, children, ...rest }: {
    src?: string;
    frame?: VirtualFrameRef;
    isolate?: VirtualFrameOptions["isolate"];
    selector?: string;
    streamingFps?: VirtualFrameOptions["streamingFps"];
    store?: StoreProxy;
    children?: import("svelte").Snippet;
    [key: string]: unknown;
  } = $props();

  let hostEl: HTMLDivElement | null = $state(null);
  let core: VirtualFrameCore | null = null;
  let ownedIframe: HTMLIFrameElement | null = null;
  let storeCleanup: (() => void) | null = null;

  function setup() {
    teardown();
    if (!hostEl) return;

    let iframe: HTMLIFrameElement | undefined;

    if (frame) {
      iframe = frame._iframe;
      frame._refCount++;
    } else if (src) {
      iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.style.cssText =
        "position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;";
      iframe.setAttribute("aria-hidden", "true");
      iframe.setAttribute("tabindex", "-1");
      hostEl.parentNode!.insertBefore(iframe, hostEl);
      ownedIframe = iframe;

      // ── Store bridge (owned source only) ──────────────
      if (store) {
        const capturedStore = store;
        const capturedIframe = iframe;
        import("@virtual-frame/store").then(({ connectPort }) => {
          let portCleanup: (() => void) | undefined;

          const connect = () => {
            if (portCleanup) return;
            if (!capturedIframe.contentWindow) return;
            const channel = new MessageChannel();
            capturedIframe.contentWindow.postMessage(
              { type: "vf-store:connect" },
              "*",
              [channel.port2],
            );
            portCleanup = connectPort(capturedStore, channel.port1);
          };

          const onMessage = (e: MessageEvent) => {
            if (
              e.source === capturedIframe.contentWindow &&
              e.data?.type === "vf-store:ready"
            ) {
              connect();
            }
          };

          window.addEventListener("message", onMessage);

          storeCleanup = () => {
            window.removeEventListener("message", onMessage);
            portCleanup?.();
          };
        });
      }
    } else {
      return;
    }

    if (!iframe) return;

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
    storeCleanup?.();
    storeCleanup = null;
    if (frame) {
      frame._refCount--;
    }
    if (ownedIframe) {
      ownedIframe.remove();
      ownedIframe = null;
    }
  }

  export function refresh() {
    if (core) core.refresh();
  }

  onMount(setup);
  onDestroy(teardown);

  $effect(() => {
    // Re-run setup when props change (read them to register reactive deps)
    const _deps = [src, frame, isolate, selector, streamingFps, store];
    if (hostEl) setup();
  });
</script>

<div bind:this={hostEl} {...rest}>
  {@render children?.()}
</div>
