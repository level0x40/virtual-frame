import { useEffect } from "react";
import { createStore, connectPort, type StoreProxy } from "@virtual-frame/store";

// ── Module-level remote store singleton ────────────────────────────────────
// Created lazily on first `useStore()` call. Populated with the host's state
// once the MessagePort arrives via a "vf-store:connect" postMessage. Lives
// for the lifetime of the page — intentionally not cleaned up on unmount.

let _store: StoreProxy | undefined;
let _portSetup = false;

function ensureStore(): StoreProxy {
  if (!_store) _store = createStore();
  return _store;
}

/**
 * Returns the shared store that the host connected via `@virtual-frame/store`.
 *
 * On first call this hook:
 *  1. Creates the local store instance (if not already created).
 *  2. Sets up a `message` listener for the `"vf-store:connect"` port message
 *     sent by the host's `VirtualFrame`.
 *  3. Announces `"vf-store:ready"` to the parent frame so the host knows
 *     the remote is ready to receive the port.
 *
 * All subsequent calls return the same singleton — the listener is set up
 * only once regardless of how many components call this hook.
 *
 * The returned proxy is always the same object reference, so it is safe to
 * use as a dependency in `useMemo` / `useCallback` / `useEffect`.
 *
 * Use `useSyncExternalStore` from React + `getStore` from
 * `@virtual-frame/store` to subscribe to individual paths:
 *
 * ```tsx
 * import { useSyncExternalStore } from "react";
 * import { getStore } from "@virtual-frame/store";
 * import { useStore } from "@virtual-frame/react/store";
 *
 * function MyComponent() {
 *   const store = useStore();
 *   const handle = getStore(store);
 *   const count = useSyncExternalStore(
 *     (cb) => handle.subscribe(["count"], cb),
 *     () => store.count as number,
 *     () => 0,
 *   );
 * }
 * ```
 */
export function useStore(): StoreProxy {
  // Initialise synchronously so the returned proxy is stable across renders.
  const store = ensureStore();

  useEffect(() => {
    if (_portSetup) return;
    _portSetup = true;

    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "vf-store:connect" && e.ports[0]) {
        connectPort(store, e.ports[0]);
      }
    };

    window.addEventListener("message", onMessage);

    // Tell the host frame that the remote is ready to receive the port.
    if (window.parent !== window) {
      window.parent.postMessage({ type: "vf-store:ready" }, "*");
    }
  }, [store]);

  return store;
}
