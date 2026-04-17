<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { VirtualFrame as VirtualFrameCore, type VirtualFrameOptions } from "virtual-frame";
import type { StoreProxy } from "@virtual-frame/store";
import type { VirtualFrameRef } from "./composables.js";

const props = defineProps<{
  src?: string;
  frame?: VirtualFrameRef;
  isolate?: VirtualFrameOptions["isolate"];
  selector?: string;
  streamingFps?: VirtualFrameOptions["streamingFps"];
  store?: StoreProxy;
}>();

const hostRef = ref<HTMLDivElement | null>(null);
let core: VirtualFrameCore | null = null;
let ownedIframe: HTMLIFrameElement | null = null;
let storeCleanup: (() => void) | null = null;

function setup() {
  teardown();
  const host = hostRef.value;
  if (!host) return;

  let iframe: HTMLIFrameElement | null = null;

  if (props.frame) {
    iframe = props.frame._iframe;
    props.frame._refCount++;
  } else if (props.src) {
    iframe = document.createElement("iframe");
    iframe.src = props.src;
    iframe.style.cssText =
      "position:absolute;width:0;height:0;border:none;opacity:0;pointer-events:none;";
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    host.parentNode!.insertBefore(iframe, host);
    ownedIframe = iframe;

    // ── Store bridge (owned source only) ──────────────
    if (props.store) {
      const store = props.store;
      const capturedIframe = iframe;
      import("@virtual-frame/store").then(({ connectPort }) => {
        let portCleanup: (() => void) | undefined;

        const connect = () => {
          if (portCleanup) return;
          if (!capturedIframe.contentWindow) return;
          const channel = new MessageChannel();
          capturedIframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [
            channel.port2,
          ]);
          portCleanup = connectPort(store, channel.port1);
        };

        const onMessage = (e: MessageEvent) => {
          if (e.source === capturedIframe.contentWindow && e.data?.type === "vf-store:ready") {
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
  storeCleanup?.();
  storeCleanup = null;
  if (props.frame) {
    props.frame._refCount--;
  }
  if (ownedIframe) {
    ownedIframe.remove();
    ownedIframe = null;
  }
}

function refresh() {
  if (core) core.refresh();
}

onMounted(setup);
onBeforeUnmount(teardown);

watch(
  () => [props.src, props.frame, props.isolate, props.selector, props.streamingFps, props.store],
  setup,
);

defineExpose({ refresh });
</script>

<template>
  <div ref="hostRef">
    <slot />
  </div>
</template>
