import { ref, onUnmounted, onMounted, type Ref } from "vue";
import { getStore as _getStore, connectPort, type StoreProxy } from "@virtual-frame/store";

// ── useStore ────────────────────────────────────────────────

/**
 * Subscribes to a path in a `@virtual-frame/store` proxy, returning a
 * reactive Vue `Ref` that updates whenever that path changes.
 *
 * ```vue
 * <script setup>
 * import { useStore } from "@virtual-frame/vue";
 *
 * // Subscribe to a single key
 * const count = useStore<number>(store, ["count"]);
 *
 * // Subscribe to a nested path
 * const name = useStore<string>(store, ["user", "name"]);
 *
 * // Subscribe to every change (no selector)
 * const snapshot = useStore(store);
 * </script>
 * ```
 *
 * @param store     Store proxy from `createStore()` or the remote `useStore()`.
 * @param selector  Property path to subscribe to (e.g. `["count"]`). When
 *                  omitted the ref updates on any mutation.
 * @returns A Vue `Ref` with the current value at the path.
 */
export function useStore<T = unknown>(store: StoreProxy, selector?: PropertyKey[]): Ref<T> {
  const handle = _getStore(store);

  function getSnapshot(): T {
    if (!selector) return handle.snapshot() as T;
    return handle.readPath(selector) as T;
  }

  const value = ref<T>(getSnapshot()) as Ref<T>;

  const unsubscribe = selector
    ? handle.subscribe(selector, () => {
        value.value = getSnapshot();
      })
    : handle.subscribe(() => {
        value.value = getSnapshot();
      });

  onUnmounted(unsubscribe);

  return value;
}

// ── useVirtualFrame ─────────────────────────────────────────

export interface VirtualFrameRef {
  /** @internal */ readonly _iframe: HTMLIFrameElement;
  /** @internal */ _refCount: number;
  /** @internal */ _storeCleanup?: () => void;
}

export interface UseVirtualFrameOptions {
  /**
   * Optional store proxy from `@virtual-frame/store`.
   *
   * When provided, state is synchronised between the host and the
   * remote in real time.
   */
  store?: StoreProxy;
}

/**
 * Creates a shared source for `src` and returns a handle that can be
 * passed to one or more `<VirtualFrame :frame="frame" />` instances.
 *
 * ```vue
 * <script setup>
 * import { useVirtualFrame, VirtualFrame } from "@virtual-frame/vue";
 *
 * const frame = useVirtualFrame("/remote/", { store });
 * </script>
 *
 * <template>
 *   <VirtualFrame :frame="frame" selector="#header" />
 *   <VirtualFrame :frame="frame" selector="#counter" />
 * </template>
 * ```
 */
export function useVirtualFrame(src: string, options?: UseVirtualFrameOptions): VirtualFrameRef {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");

  const frame: VirtualFrameRef = { _iframe: iframe, _refCount: 0 };

  onMounted(() => {
    document.body.appendChild(iframe);

    // ── Store bridge ────────────────────────────────────
    // `connectPort` is imported statically — `@virtual-frame/store` is
    // already pulled into the chunk by `getStore`/`StoreProxy` above,
    // and the `./store` re-export in `index.ts` would have forced it
    // either way.  Previous `import(…).then(…)` was a no-op lazy load.
    const store = options?.store;
    if (store && !frame._storeCleanup) {
      let portCleanup: (() => void) | undefined;

      const connect = () => {
        if (portCleanup) return;
        if (!iframe.contentWindow) return;
        const channel = new MessageChannel();
        iframe.contentWindow.postMessage({ type: "vf-store:connect" }, "*", [channel.port2]);
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (e.source === iframe.contentWindow && e.data?.type === "vf-store:ready") {
          connect();
        }
      };

      window.addEventListener("message", onMessage);

      frame._storeCleanup = () => {
        window.removeEventListener("message", onMessage);
        portCleanup?.();
      };
    }
  });

  onUnmounted(() => {
    frame._storeCleanup?.();
    frame._storeCleanup = undefined;
    iframe.remove();
  });

  return frame;
}
