import { onDestroy } from "svelte";
import { readable, type Readable } from "svelte/store";
import { getStore as _getStore, type StoreProxy } from "@virtual-frame/store";

// ── useStore ────────────────────────────────────────────────

/**
 * Subscribes to a path in a `@virtual-frame/store` proxy, returning a
 * Svelte readable store that updates whenever that path changes.
 *
 * Use the `$` store shorthand to get a reactive value in templates:
 *
 * ```svelte
 * <script>
 *   import { useStore } from "@virtual-frame/svelte";
 *
 *   // Subscribe to a single key
 *   const count = useStore(store, ["count"]);
 *
 *   // Subscribe to a nested path
 *   const name = useStore(store, ["user", "name"]);
 *
 *   // Subscribe to every change (no selector)
 *   const snapshot = useStore(store);
 * </script>
 *
 * <p>{$count}</p>
 * ```
 *
 * @param store     Store proxy from `createStore()` or the remote `useStore()`.
 * @param selector  Property path to subscribe to (e.g. `["count"]`). When
 *                  omitted the readable updates on any mutation.
 * @returns A Svelte `Readable` with the current value at the path.
 */
export function useStore<T = unknown>(
  store: StoreProxy,
  selector?: PropertyKey[],
): Readable<T> {
  const handle = _getStore(store);

  function getSnapshot(): T {
    if (!selector) return handle.snapshot() as T;
    return handle.readPath(selector) as T;
  }

  return readable<T>(getSnapshot(), (set) => {
    return selector
      ? handle.subscribe(selector, () => set(getSnapshot()))
      : handle.subscribe(() => set(getSnapshot()));
  });
}

// ── createVirtualFrame ──────────────────────────────────────

export interface VirtualFrameRef {
  /** @internal */ readonly _iframe: HTMLIFrameElement;
  /** @internal */ _refCount: number;
  /** @internal */ _storeCleanup?: () => void;
}

export interface CreateVirtualFrameOptions {
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
 * passed to one or more `<VirtualFrame frame={frame} />` instances.
 *
 * Must be called during component initialisation (so `onDestroy` can
 * register cleanup).
 *
 * ```svelte
 * <script>
 *   import { createVirtualFrame, VirtualFrame } from "@virtual-frame/svelte";
 *
 *   const frame = createVirtualFrame("/remote/", { store });
 * </script>
 *
 * <VirtualFrame {frame} selector="#header" />
 * <VirtualFrame {frame} selector="#counter" />
 * ```
 */
export function createVirtualFrame(
  src: string,
  options?: CreateVirtualFrameOptions,
): VirtualFrameRef {
  const iframe = document.createElement("iframe");
  iframe.src = src;
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;pointer-events:none;";
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  document.body.appendChild(iframe);

  const frame: VirtualFrameRef = { _iframe: iframe, _refCount: 0 };

  // ── Store bridge ────────────────────────────────────
  const store = options?.store;
  if (store) {
    import("@virtual-frame/store").then(({ connectPort }) => {
      if (frame._storeCleanup) return;

      let portCleanup: (() => void) | undefined;

      const connect = () => {
        if (portCleanup) return;
        if (!iframe.contentWindow) return;
        const channel = new MessageChannel();
        iframe.contentWindow.postMessage(
          { type: "vf-store:connect" },
          "*",
          [channel.port2],
        );
        portCleanup = connectPort(store, channel.port1);
      };

      const onMessage = (e: MessageEvent) => {
        if (
          e.source === iframe.contentWindow &&
          e.data?.type === "vf-store:ready"
        ) {
          connect();
        }
      };

      window.addEventListener("message", onMessage);

      frame._storeCleanup = () => {
        window.removeEventListener("message", onMessage);
        portCleanup?.();
      };
    });
  }

  onDestroy(() => {
    frame._storeCleanup?.();
    frame._storeCleanup = undefined;
    iframe.remove();
  });

  return frame;
}
