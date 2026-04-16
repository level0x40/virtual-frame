<script lang="ts">
// ── Shared iframe registry (module-scoped) ──────────────────────
// Multiple VirtualFrame instances pointing to the same `src` share a
// single hidden iframe (ref-counted).  The first instance to mount
// creates the iframe; subsequent instances just bump the refCount.
// The iframe is removed only when the last consumer unmounts.
const _sharedIframes: Map<
  string,
  { iframe: HTMLIFrameElement; refCount: number; storeCleanup?: () => void }
> = new Map();
</script>

<script setup lang="ts">
  import { ref, onMounted, onBeforeUnmount, watch } from "vue";
  import {
    VirtualFrame as VirtualFrameCore,
    type VirtualFrameOptions,
  } from "virtual-frame";
  import type { StoreProxy } from "@virtual-frame/store";

  const props = defineProps<{
    src?: string;
    isolate?: VirtualFrameOptions["isolate"];
    selector?: string;
    streamingFps?: VirtualFrameOptions["streamingFps"];
    store?: StoreProxy;
    proxy?: string;
    /** @internal SSR HTML from `prepareVirtualFrameProps()`. */
    _vfHtml?: string;
  }>();

  const hostRef = ref<HTMLDivElement | null>(null);
  let core: VirtualFrameCore | null = null;
  let sharedKey: string | null = null;

  // After mount, stop rendering the SSR HTML via v-html.
  // The shadow root already exists (from the browser's HTML parser on
  // initial page load, or from setHTMLUnsafe on client-side navigation)
  // and VirtualFrameCore owns it.
  const mounted = ref(false);

  function setup() {
    teardown();
    const host = hostRef.value;
    if (!host || !props.src) return;

    // On client-side navigation, the browser's HTML parser doesn't process
    // <template shadowrootmode> in innerHTML.  Use setHTMLUnsafe() to parse it.
    if (props._vfHtml && !host.shadowRoot) {
      const template = host.querySelector(
        "template[shadowrootmode]"
      ) as HTMLTemplateElement | null;
      if (template && typeof (host as any).setHTMLUnsafe === "function") {
        (host as any).setHTMLUnsafe(props._vfHtml);
      }
    }

    mounted.value = true;

    // ── Shared iframe setup (cross-origin via iframe.src) ──────
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

      host.parentNode!.insertBefore(iframe, host);

      shared = { iframe, refCount: 1 };
      _sharedIframes.set(props.src, shared);
    }

    // ── Store bridge ────────────────────────────────────────
    if (props.store && !shared.storeCleanup) {
      const store = props.store;
      const capturedSrc = props.src;
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

    sharedKey = props.src;

    core = new VirtualFrameCore(iframe, host, {
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

  function refresh() {
    if (core) core.refresh();
  }

  onMounted(setup);
  onBeforeUnmount(teardown);

  watch(
    () => [props.src, props.isolate, props.selector, props.streamingFps, props.store],
    setup,
  );

  defineExpose({ refresh });
</script>

<template>
  <div
    ref="hostRef"
    data-vf-host
    v-html="mounted ? '' : (_vfHtml || '')"
  />
</template>
